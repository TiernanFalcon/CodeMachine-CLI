import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, createReadStream, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import type { WriteStream } from 'fs';
import * as logger from '../../shared/logging/logger.js';
import { AgentMonitorService } from './monitor.js';
import { LogLockService } from './logLock.js';
import { addMarker } from '../../shared/formatters/outputMarkers.js';

/**
 * Log rotation configuration
 */
const LOG_ROTATION = {
  /** Maximum log file size in bytes (10 MB) */
  MAX_SIZE: 10 * 1024 * 1024,
  /** Number of rotated files to keep */
  MAX_FILES: 5,
  /** Check rotation every N writes */
  CHECK_INTERVAL: 100,
} as const;

/**
 * Manages log file I/O for agents
 * Creates individual log files and provides streaming interfaces
 */
export class AgentLoggerService {
  private static instance: AgentLoggerService;
  private activeStreams: Map<number, WriteStream> = new Map();
  private lockService: LogLockService = new LogLockService();
  // Store full prompts temporarily (for debug mode logging) - cleared after stream creation
  private fullPrompts: Map<number, string> = new Map();
  // Write counter for rotation checks (check every N writes for performance)
  private writeCounters: Map<number, number> = new Map();

  private constructor() {
    logger.debug('AgentLoggerService initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AgentLoggerService {
    if (!AgentLoggerService.instance) {
      AgentLoggerService.instance = new AgentLoggerService();
    }
    return AgentLoggerService.instance;
  }

  /**
   * Store full prompt temporarily for debug mode logging
   * Should be called right after agent registration, before any writes
   */
  storeFullPrompt(agentId: number, fullPrompt: string): void {
    this.fullPrompts.set(agentId, fullPrompt);
  }

  /**
   * Create a write stream for an agent's log file
   * Returns a stream that can be written to immediately
   * Acquires file lock asynchronously in background
   */
  createStream(agentId: number): WriteStream {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);

    if (!agent) {
      throw new Error(`Cannot create log stream for non-existent agent ${agentId}`);
    }

    // Ensure log directory exists
    const logDir = dirname(agent.logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Create write stream immediately with error handling
    const stream = createWriteStream(agent.logPath, { flags: 'a', encoding: 'utf-8' });

    // Handle stream errors to prevent silent data loss (ISSUE-025)
    stream.on('error', (err) => {
      logger.error(`Stream write error for agent ${agentId}: ${err.message}`);
    });

    this.activeStreams.set(agentId, stream);

    // Write header with first line of prompt only
    const firstLine = agent.prompt.split('\n')[0];
    const promptToLog = firstLine;
    // Clean up any stored full prompt
    this.fullPrompts.delete(agentId);

    // Format timestamp for better readability (remove T and milliseconds)
    const formattedTime = agent.startTime.replace('T', ' ').replace(/\.\d{3}Z$/, '');

    // Box-style header
    const boxWidth = 64;
    const headerText = `Agent ${agentId}: ${agent.name}`;
    const dashCount = Math.max(0, boxWidth - headerText.length - 3); // -3 for "╭─ "

    // Use === prefix for bold styling (detected by getBold in lineSyntaxHighlight.tsx)
    stream.write(addMarker('CYAN', `===╭─ ${headerText} ${'─'.repeat(dashCount)}\n`));
    stream.write(addMarker('CYAN', `   Started: ${formattedTime}\n`));
    stream.write(addMarker('CYAN', `   Prompt: ${promptToLog}\n`));
    stream.write(addMarker('CYAN', `╰${'─'.repeat(boxWidth - 1)}\n\n`));

    // Acquire lock asynchronously in background
    // NOTE: Writes can occur before lock is acquired. This is acceptable because:
    // 1. We're the only writer in this process (single-threaded)
    // 2. The lock prevents OTHER processes from writing simultaneously
    // 3. If lock fails, we log a warning but continue (degraded mode)
    this.lockService.acquireLock(agent.logPath).catch(error => {
      logger.warn(`Failed to acquire lock for ${agent.logPath} - continuing without lock: ${error}`);
    });

    logger.debug(`Created log stream for agent ${agentId} at ${agent.logPath}`);
    return stream;
  }

  /**
   * Check if log file needs rotation based on size
   */
  private needsRotation(logPath: string): boolean {
    if (!existsSync(logPath)) {
      return false;
    }
    try {
      const stats = statSync(logPath);
      return stats.size >= LOG_ROTATION.MAX_SIZE;
    } catch {
      return false;
    }
  }

  /**
   * Rotate log files: current.log -> current.log.1 -> current.log.2 -> ...
   * Removes oldest files beyond MAX_FILES limit
   */
  private rotateLogFile(logPath: string): void {
    try {
      // Delete oldest file if it exists
      const oldestPath = `${logPath}.${LOG_ROTATION.MAX_FILES}`;
      if (existsSync(oldestPath)) {
        unlinkSync(oldestPath);
      }

      // Shift existing rotated files: .4 -> .5, .3 -> .4, etc.
      for (let i = LOG_ROTATION.MAX_FILES - 1; i >= 1; i--) {
        const currentPath = `${logPath}.${i}`;
        const nextPath = `${logPath}.${i + 1}`;
        if (existsSync(currentPath)) {
          renameSync(currentPath, nextPath);
        }
      }

      // Rotate current log to .1
      if (existsSync(logPath)) {
        renameSync(logPath, `${logPath}.1`);
      }

      logger.debug(`Rotated log file: ${logPath}`);
    } catch (error) {
      logger.error(`Failed to rotate log file ${logPath}: ${error}`);
    }
  }

  /**
   * Check and perform rotation if needed for an agent's log
   */
  private checkRotation(agentId: number): void {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);

    if (!agent) return;

    if (this.needsRotation(agent.logPath)) {
      // Close current stream before rotation
      const stream = this.activeStreams.get(agentId);
      if (stream) {
        stream.end();
        this.activeStreams.delete(agentId);
      }

      // Rotate the file
      this.rotateLogFile(agent.logPath);

      // Create new stream (will be created on next write)
      logger.debug(`Log rotation completed for agent ${agentId}`);
    }
  }

  /**
   * Write data to an agent's log file
   * If stream doesn't exist, creates it
   * Checks for log rotation periodically
   */
  write(agentId: number, data: string): void {
    // Increment write counter and check rotation periodically
    const count = (this.writeCounters.get(agentId) || 0) + 1;
    this.writeCounters.set(agentId, count);

    if (count % LOG_ROTATION.CHECK_INTERVAL === 0) {
      this.checkRotation(agentId);
    }

    let stream = this.activeStreams.get(agentId);

    if (!stream) {
      stream = this.createStream(agentId);
    }

    stream.write(data);
  }

  /**
   * Close an agent's log stream and release file lock
   */
  async closeStream(agentId: number): Promise<void> {
    const stream = this.activeStreams.get(agentId);
    if (stream) {
      const monitor = AgentMonitorService.getInstance();
      const agent = monitor.getAgent(agentId);

      // Release lock FIRST
      if (agent) {
        await this.lockService.releaseLock(agent.logPath);
      }

      // Then close stream
      stream.end();
      this.activeStreams.delete(agentId);
      logger.debug(`Closed log stream for agent ${agentId}`);
    }
  }

  /**
   * Read complete log file for an agent
   */
  readLog(agentId: number): string {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!existsSync(agent.logPath)) {
      return `No log file found at ${agent.logPath}`;
    }

    try {
      return readFileSync(agent.logPath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to read log for agent ${agentId}: ${error}`);
      return `Error reading log file: ${error}`;
    }
  }

  /**
   * Stream logs in real-time (tail -f style)
   * For active agents, streams new content as it's written
   * For offline agents, returns complete log
   */
  async streamLogs(agentId: number, callback: (chunk: string) => void): Promise<void> {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!existsSync(agent.logPath)) {
      callback(`No log file found for agent ${agentId}\n`);
      return;
    }

    // For offline agents, just dump the complete log
    if (agent.status !== 'running') {
      const content = this.readLog(agentId);
      callback(content);
      return;
    }

    // For active agents, implement tail -f style streaming
    await this.tailFile(agent.logPath, callback);
  }

  /**
   * Tail a file (similar to tail -f)
   * Reads existing content and watches for new writes
   */
  private async tailFile(filePath: string, callback: (chunk: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // First, read existing content
        const stream = createReadStream(filePath, { encoding: 'utf-8' });

        stream.on('data', (chunk) => {
          callback(chunk.toString());
        });

        stream.on('end', () => {
          // After reading existing content, watch for new writes
          // For now, we'll just resolve - a production implementation
          // would use fs.watch() or similar to continue watching
          resolve();
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get log file stats
   */
  getLogStats(agentId: number): { size: number; exists: boolean } {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);

    if (!agent || !existsSync(agent.logPath)) {
      return { size: 0, exists: false };
    }

    const stats = statSync(agent.logPath);
    return {
      size: stats.size,
      exists: true
    };
  }

  /**
   * Get writable stream for dual-streaming
   * Returns a function that can be called with data to write to log
   */
  getLogWriter(agentId: number): (data: string) => void {
    return (data: string) => {
      this.write(agentId, data);
    };
  }

  /**
   * Release all file locks
   * Used during cleanup/shutdown
   */
  async releaseAllLocks(): Promise<void> {
    await this.lockService.releaseAllLocks();
  }

  /**
   * Get log file path for an agent
   * Used by LogViewer to access log files
   */
  getLogPath(agentId: number): string | null {
    const monitor = AgentMonitorService.getInstance();
    const agent = monitor.getAgent(agentId);
    return agent?.logPath || null;
  }
}
