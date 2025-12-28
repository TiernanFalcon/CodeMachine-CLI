/**
 * Health Check System
 *
 * Validates system state at startup including engine availability,
 * database connectivity, and workspace configuration.
 */

import { stat, access, constants } from 'node:fs/promises';
import { getCodemachinePaths, getCodemachineFiles } from '../../shared/config/paths.js';
import { debug, info, warn, error as logError } from '../../shared/logging/logger.js';

// =============================================================================
// Types
// =============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
  duration: number;
}

export interface SystemHealthReport {
  overall: HealthStatus;
  timestamp: Date;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

export interface HealthCheckOptions {
  /** Skip specific checks */
  skip?: string[];
  /** Timeout for individual checks (ms) */
  timeout?: number;
  /** Continue even if checks fail */
  continueOnError?: boolean;
}

// =============================================================================
// Individual Health Checks
// =============================================================================

/**
 * Check if the workspace directory exists and is accessible
 */
async function checkWorkspace(cwd: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const name = 'workspace';

  try {
    const paths = getCodemachinePaths(cwd);

    // Check if .codemachine directory exists
    try {
      await stat(paths.root);
    } catch {
      return {
        name,
        status: 'degraded',
        message: '.codemachine directory not found (will be created on first run)',
        duration: Date.now() - start,
      };
    }

    // Check subdirectory access
    const dirChecks = await Promise.all([
      access(paths.root, constants.R_OK | constants.W_OK).then(() => true).catch(() => false),
    ]);

    if (!dirChecks[0]) {
      return {
        name,
        status: 'unhealthy',
        message: '.codemachine directory is not readable/writable',
        duration: Date.now() - start,
      };
    }

    return {
      name,
      status: 'healthy',
      message: 'Workspace is accessible',
      details: { path: paths.root },
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'unhealthy',
      message: `Workspace check failed: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - start,
    };
  }
}

/**
 * Check database connectivity
 */
async function checkDatabase(cwd: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const name = 'database';

  try {
    const files = getCodemachineFiles(cwd);
    const dbPath = files.registryDb;

    // Check if database file exists (optional - will be created on first use)
    try {
      await stat(dbPath);

      // Try to read the file to verify it's accessible
      await access(dbPath, constants.R_OK | constants.W_OK);

      return {
        name,
        status: 'healthy',
        message: 'Database is accessible',
        details: { path: dbPath },
        duration: Date.now() - start,
      };
    } catch {
      return {
        name,
        status: 'degraded',
        message: 'Database file not found (will be created on first use)',
        details: { path: dbPath },
        duration: Date.now() - start,
      };
    }
  } catch (err) {
    return {
      name,
      status: 'unhealthy',
      message: `Database check failed: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - start,
    };
  }
}

/**
 * Check engine availability
 */
async function checkEngines(): Promise<HealthCheckResult> {
  const start = Date.now();
  const name = 'engines';

  try {
    // Dynamically import registry to avoid circular dependencies
    const { registry } = await import('../../infra/engines/index.js');

    const engineIds = registry.getAllIds();
    const engineStatus: Record<string, { installed: boolean; authenticated: boolean }> = {};

    let anyAuthenticated = false;

    for (const engineId of engineIds) {
      try {
        const engine = await registry.getAsync(engineId);
        if (engine) {
          const isAuth = await engine.auth.isAuthenticated();
          engineStatus[engineId] = {
            installed: true,
            authenticated: isAuth,
          };
          if (isAuth) anyAuthenticated = true;
        }
      } catch {
        engineStatus[engineId] = { installed: false, authenticated: false };
      }
    }

    if (!anyAuthenticated) {
      return {
        name,
        status: 'degraded',
        message: 'No engines are authenticated',
        details: { engines: engineStatus },
        duration: Date.now() - start,
      };
    }

    return {
      name,
      status: 'healthy',
      message: 'At least one engine is authenticated',
      details: { engines: engineStatus },
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'unhealthy',
      message: `Engine check failed: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - start,
    };
  }
}

/**
 * Check file system permissions
 */
async function checkFileSystem(cwd: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const name = 'filesystem';

  try {
    // Check current directory is readable
    await access(cwd, constants.R_OK);

    // Check we can write to current directory (for output files)
    await access(cwd, constants.W_OK);

    return {
      name,
      status: 'healthy',
      message: 'File system access is available',
      details: { cwd },
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'unhealthy',
      message: `File system check failed: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - start,
    };
  }
}

/**
 * Check Node/Bun runtime
 */
async function checkRuntime(): Promise<HealthCheckResult> {
  const start = Date.now();
  const name = 'runtime';

  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    return {
      name,
      status: 'healthy',
      message: 'Runtime is operational',
      details: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        uptimeSeconds: Math.round(uptime),
      },
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'unhealthy',
      message: `Runtime check failed: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - start,
    };
  }
}

// =============================================================================
// Main Health Check Runner
// =============================================================================

/**
 * Run all health checks and return a comprehensive report
 */
export async function runHealthChecks(
  cwd: string = process.cwd(),
  options: HealthCheckOptions = {}
): Promise<SystemHealthReport> {
  const { skip = [], timeout = 10000 } = options;

  const allChecks: Array<{ name: string; fn: () => Promise<HealthCheckResult> }> = [
    { name: 'runtime', fn: checkRuntime },
    { name: 'filesystem', fn: () => checkFileSystem(cwd) },
    { name: 'workspace', fn: () => checkWorkspace(cwd) },
    { name: 'database', fn: () => checkDatabase(cwd) },
    { name: 'engines', fn: checkEngines },
  ];

  // Filter out skipped checks
  const checksToRun = allChecks.filter(c => !skip.includes(c.name));

  // Run all checks with timeout
  const results: HealthCheckResult[] = await Promise.all(
    checksToRun.map(async ({ name, fn }) => {
      try {
        const timeoutPromise = new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timed out')), timeout)
        );
        return await Promise.race([fn(), timeoutPromise]);
      } catch (err) {
        return {
          name,
          status: 'unhealthy' as HealthStatus,
          message: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          duration: timeout,
        };
      }
    })
  );

  // Calculate summary
  const summary = {
    total: results.length,
    healthy: results.filter(r => r.status === 'healthy').length,
    degraded: results.filter(r => r.status === 'degraded').length,
    unhealthy: results.filter(r => r.status === 'unhealthy').length,
  };

  // Determine overall status
  let overall: HealthStatus = 'healthy';
  if (summary.unhealthy > 0) {
    overall = 'unhealthy';
  } else if (summary.degraded > 0) {
    overall = 'degraded';
  }

  return {
    overall,
    timestamp: new Date(),
    checks: results,
    summary,
  };
}

/**
 * Run health checks and log results
 */
export async function runHealthChecksWithLogging(
  cwd: string = process.cwd(),
  options: HealthCheckOptions = {}
): Promise<SystemHealthReport> {
  debug('Running health checks...');

  const report = await runHealthChecks(cwd, options);

  // Log individual check results
  for (const check of report.checks) {
    const logFn = check.status === 'healthy' ? debug : check.status === 'degraded' ? warn : logError;
    logFn(`[Health] ${check.name}: ${check.status} - ${check.message}`);
  }

  // Log summary
  const summaryMsg = `Health check complete: ${report.summary.healthy}/${report.summary.total} healthy`;
  if (report.overall === 'healthy') {
    info(summaryMsg);
  } else if (report.overall === 'degraded') {
    warn(`${summaryMsg} (${report.summary.degraded} degraded)`);
  } else {
    logError(`${summaryMsg} (${report.summary.unhealthy} unhealthy)`);
  }

  return report;
}

/**
 * Quick health check - returns true if system is operational
 */
export async function isSystemHealthy(cwd: string = process.cwd()): Promise<boolean> {
  const report = await runHealthChecks(cwd, { skip: ['engines'] });
  return report.overall !== 'unhealthy';
}
