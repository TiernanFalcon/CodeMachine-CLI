/**
 * CCR (Claude Code Runner) engine configuration
 */

export interface CCRConfig {
  /**
   * Optional model identifier for CCR
   */
  model?: string;
  /**
   * Working directory for execution
   */
  workingDir?: string;
}

/**
 * Resolve a CCR model name.
 * Currently pass-through to keep the hook for future mapping logic.
 */
export function resolveModel(model?: string): string | undefined {
  const trimmed = model?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Default timeout for CCR operations (30 minutes)
 */
export const DEFAULT_TIMEOUT = 1800000;

/**
 * Environment variable names
 */
export const ENV = {
  SKIP_CCR: 'CODEMACHINE_SKIP_CCR',
  PLAIN_LOGS: 'CODEMACHINE_PLAIN_LOGS',
} as const;
