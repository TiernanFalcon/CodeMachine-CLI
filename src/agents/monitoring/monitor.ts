import type { Database } from 'bun:sqlite';
import type { ParsedTelemetry } from '../../shared/telemetry/index.js';
import { getDB } from './db/connection.js';
import { AgentRepository } from './db/repository.js';
import type { AgentRecord, AgentQueryFilters, AgentStatus, RegisterAgentInput } from './types.js';
import * as logger from '../../shared/logging/logger.js';

/**
 * Dependencies for AgentMonitorService
 */
export interface AgentMonitorDependencies {
  db?: Database;
  repository?: AgentRepository;
}

/**
 * Central service for monitoring agent lifecycle
 * Tracks all agent executions (workflow, CLI, orchestrated)
 *
 * Prefer using createAgentMonitor() for new code to enable dependency injection.
 * getInstance() is maintained for backward compatibility.
 */
export class AgentMonitorService {
  private static instance: AgentMonitorService | null = null;
  private static creating = false;
  private repository: AgentRepository;

  /**
   * Constructor accepts optional dependencies for DI
   * @param deps - Optional dependencies (db or repository)
   */
  constructor(deps?: AgentMonitorDependencies) {
    if (deps?.repository) {
      this.repository = deps.repository;
    } else {
      const db = deps?.db ?? getDB();
      this.repository = new AgentRepository(db);
    }
    logger.debug('AgentMonitorService initialized');
  }

  /**
   * Get singleton instance
   * @deprecated Prefer createAgentMonitor() for new code to enable dependency injection
   */
  static getInstance(): AgentMonitorService {
    if (!AgentMonitorService.instance) {
      if (AgentMonitorService.creating) {
        throw new Error('AgentMonitorService is being created - recursive getInstance() call detected');
      }
      AgentMonitorService.creating = true;
      try {
        AgentMonitorService.instance = new AgentMonitorService();
      } finally {
        AgentMonitorService.creating = false;
      }
    }
    return AgentMonitorService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   * @internal
   */
  static resetInstance(): void {
    AgentMonitorService.instance = null;
  }

  /**
   * Set a custom instance (for testing with mocks)
   * @internal
   */
  static setInstance(instance: AgentMonitorService): void {
    AgentMonitorService.instance = instance;
  }

  /**
   * Register a new agent and return its ID
   */
  async register(input: RegisterAgentInput, logPath?: string): Promise<number> {
    const tempLogPath = logPath || this.getDefaultLogPath(0, input.name, new Date().toISOString());

    const id = this.repository.register(input, tempLogPath);

    if (!logPath) {
      const finalLogPath = this.getDefaultLogPath(id, input.name, new Date().toISOString());
      this.repository.update(id, { logPath: finalLogPath });
    }

    logger.debug(`Registered agent ${id} (${input.name})`);
    return id;
  }

  /**
   * Mark agent as completed
   */
  async complete(id: number, telemetry?: ParsedTelemetry): Promise<void> {
    const agent = this.repository.get(id);
    if (!agent) {
      logger.warn(`Attempted to complete non-existent agent ${id}`);
      return;
    }

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(agent.startTime).getTime();

    const updates: Partial<AgentRecord> = {
      status: 'completed',
      endTime,
      duration,
    };

    // Only update telemetry if provided (preserve existing telemetry otherwise)
    if (telemetry) {
      updates.telemetry = telemetry;
    }

    this.repository.update(id, updates);

    logger.debug(`Agent ${id} (${agent.name}) completed in ${duration}ms`);
  }

  /**
   * Mark agent as running (for resume)
   */
  async markRunning(id: number): Promise<void> {
    const agent = this.repository.get(id);
    if (!agent) {
      logger.warn(`Attempted to mark non-existent agent ${id} as running`);
      return;
    }

    this.repository.update(id, { status: 'running' });
    logger.debug(`Agent ${id} (${agent.name}) marked as running (resumed)`);
  }

  /**
   * Mark agent as paused (for pause/resume)
   */
  async markPaused(id: number): Promise<void> {
    const agent = this.repository.get(id);
    if (!agent) {
      logger.warn(`Attempted to mark non-existent agent ${id} as paused`);
      return;
    }

    this.repository.update(id, { status: 'paused' });
    logger.debug(`Agent ${id} (${agent.name}) marked as paused`);
  }

  /**
   * Mark agent as skipped
   */
  async markSkipped(id: number): Promise<void> {
    const agent = this.repository.get(id);
    if (!agent) {
      logger.warn(`Attempted to mark non-existent agent ${id} as skipped`);
      return;
    }

    this.repository.update(id, { status: 'skipped' });
    logger.debug(`Agent ${id} (${agent.name}) marked as skipped`);
  }

  /**
   * Mark agent as failed
   */
  async fail(id: number, error: Error | string): Promise<void> {
    const agent = this.repository.get(id);
    if (!agent) {
      logger.warn(`Attempted to fail non-existent agent ${id}`);
      return;
    }

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(agent.startTime).getTime();
    const errorMessage = error instanceof Error ? error.message : error;

    // Preserve existing telemetry when failing
    this.repository.update(id, {
      status: 'failed',
      endTime,
      duration,
      error: errorMessage
      // Note: telemetry is NOT included here, so existing telemetry is preserved
    });

    // Suppress error logs for user interruptions (Ctrl+C) - use debug instead
    if (errorMessage.includes('User interrupted')) {
      logger.debug(`Agent ${id} (${agent.name}) aborted by user after ${duration}ms`);
    } else if (errorMessage.includes('operation was aborted')) {
      logger.debug(`Agent ${id} (${agent.name}) failed after ${duration}ms: ${errorMessage}`);
    } else {
      logger.error(`Agent ${id} (${agent.name}) failed after ${duration}ms: ${errorMessage}`);
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(id: number, status: AgentStatus): Promise<void> {
    this.repository.update(id, { status });
  }

  /**
   * Update agent telemetry
   */
  async updateTelemetry(id: number, telemetry: ParsedTelemetry): Promise<void> {
    this.repository.update(id, { telemetry });
  }

  /**
   * Set session ID for resume capability
   */
  async setSessionId(id: number, sessionId: string): Promise<void> {
    this.repository.update(id, { sessionId });
    logger.debug(`Set session ID for agent ${id}: ${sessionId}`);
  }

  /**
   * Get agent by ID
   */
  getAgent(id: number): AgentRecord | undefined {
    const agent = this.repository.get(id);
    return agent ? this.validateAndCleanupAgent(agent) : undefined;
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentRecord[] {
    return this.repository.getAll().map(agent => this.validateAndCleanupAgent(agent));
  }

  /**
   * Get all active (running) agents
   */
  getActiveAgents(): AgentRecord[] {
    return this.getAllAgents().filter(agent => agent.status === 'running');
  }

  /**
   * Get all offline (completed/failed) agents
   */
  getOfflineAgents(): AgentRecord[] {
    return this.getAllAgents().filter(agent => agent.status !== 'running');
  }

  /**
   * Get agents matching query filters
   */
  queryAgents(filters: AgentQueryFilters): AgentRecord[] {
    let agents = this.getAllAgents();

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      agents = agents.filter(agent => statuses.includes(agent.status));
    }

    if (filters.parentId !== undefined) {
      agents = agents.filter(agent => agent.parentId === filters.parentId);
    }

    if (filters.name) {
      agents = agents.filter(agent => agent.name === filters.name);
    }

    return agents;
  }

  /**
   * Get root agents (agents without parents)
   * Reloads from disk to ensure fresh data
   */
  getRootAgents(): AgentRecord[] {
    // Reload already happens in getAllAgents()
    return this.getAllAgents().filter(agent => !agent.parentId);
  }

  /**
   * Get children of a specific agent
   */
  getChildren(parentId: number): AgentRecord[] {
    return this.repository.getChildren(parentId).map(agent => this.validateAndCleanupAgent(agent));
  }

  /**
   * Build hierarchical tree structure for display
   * Uses single query + in-memory tree construction (O(n) instead of O(n²))
   */
  buildAgentTree(): AgentTreeNode[] {
    const allAgents = this.getAllAgents();

    // Build lookup maps in O(n)
    const agentMap = new Map<number, AgentRecord>();
    const childrenMap = new Map<number, AgentRecord[]>();
    const roots: AgentRecord[] = [];

    for (const agent of allAgents) {
      agentMap.set(agent.id, agent);
      if (!agent.parentId) {
        roots.push(agent);
      } else {
        const siblings = childrenMap.get(agent.parentId);
        if (siblings) {
          siblings.push(agent);
        } else {
          childrenMap.set(agent.parentId, [agent]);
        }
      }
    }

    // Build tree recursively using in-memory maps
    const buildNode = (agent: AgentRecord): AgentTreeNode => {
      const children = childrenMap.get(agent.id) ?? [];
      return {
        agent,
        children: children.map(child => buildNode(child))
      };
    };

    return roots.map(root => buildNode(root));
  }

  /**
   * Get full subtree for an agent (agent + all descendants recursively)
   */
  getFullSubtree(agentId: number): AgentRecord[] {
    return this.repository.getFullSubtree(agentId);
  }

  /**
   * Clear all descendants of an agent (used for loop resets)
   */
  async clearDescendants(agentId: number): Promise<void> {
    const count = this.repository.clearDescendants(agentId);
    logger.debug(`Cleared ${count} descendants for agent ${agentId}`);
  }

  /**
   * Clear all agents from history
   */
  async clearAll(): Promise<number> {
    const count = this.repository.clearAll();
    logger.info(`Cleared all ${count} agents from history`);
    return count;
  }

  /**
   * Group all agents by their root parent (top-level parent)
   * Returns a map of root agent ID -> array of all descendants
   */
  getAgentsByRoot(): Map<number, AgentRecord[]> {
    const grouped = new Map<number, AgentRecord[]>();
    const roots = this.getRootAgents();

    for (const root of roots) {
      const subtree = this.getFullSubtree(root.id);
      grouped.set(root.id, subtree);
    }

    return grouped;
  }

  /**
   * Return agent as-is without auto-marking
   * Status updates are now handled explicitly by the workflow runner:
   * - complete() for successful completion
   * - fail() for errors
   * - markPaused() for resumable process exits
   * - markRunning() for resume
   */
  private validateAndCleanupAgent(agent: AgentRecord): AgentRecord {
    return agent;
  }

  /**
   * Generate default log path for an agent
   */
  private getDefaultLogPath(id: number, name: string, startTime: string): string {
    const timestamp = new Date(startTime).toISOString().replace(/:/g, '-').replace(/\..+/, '');
    return `.codemachine/logs/agent-${id}-${name}-${timestamp}.log`;
  }
}

/**
 * Tree node for hierarchical agent display
 */
export interface AgentTreeNode {
  agent: AgentRecord;
  children: AgentTreeNode[];
}

/**
 * Factory function to create AgentMonitorService with dependency injection
 * Preferred over getInstance() for new code and testing
 *
 * @param deps - Optional dependencies for testing
 * @returns A new AgentMonitorService instance
 *
 * @example
 * // Production usage
 * const monitor = createAgentMonitor();
 *
 * @example
 * // Testing with mock repository
 * const mockRepo = new MockAgentRepository();
 * const monitor = createAgentMonitor({ repository: mockRepo });
 */
export function createAgentMonitor(deps?: AgentMonitorDependencies): AgentMonitorService {
  return new AgentMonitorService(deps);
}
