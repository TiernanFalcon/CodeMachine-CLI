/**
 * Centralized Environment Variable Definitions
 *
 * All CODEMACHINE_* environment variables are defined here
 * to provide a single source of truth and avoid scattered parsing logic.
 */

/**
 * Environment variable names used by CodeMachine
 */
export const ENV_VARS = {
  // =============================================================================
  // Core Configuration
  // =============================================================================

  /** Current working directory override */
  CWD: 'CODEMACHINE_CWD',

  /** Installation directory for CodeMachine */
  INSTALL_DIR: 'CODEMACHINE_INSTALL_DIR',

  /** Skip authentication checks (for testing/CI) */
  SKIP_AUTH: 'CODEMACHINE_SKIP_AUTH',

  // =============================================================================
  // Logging and Debug
  // =============================================================================

  /** Enable plain logs without formatting */
  PLAIN_LOGS: 'CODEMACHINE_PLAIN_LOGS',

  /** Debug mode flag (standard) */
  DEBUG: 'DEBUG',

  /** Log level (debug, info, warn, error) */
  LOG_LEVEL: 'LOG_LEVEL',

  // =============================================================================
  // Agent and Workflow
  // =============================================================================

  /** Parent agent ID for child processes */
  PARENT_AGENT_ID: 'CODEMACHINE_PARENT_AGENT_ID',

  /** Override for agents directory */
  AGENTS_DIR: 'CODEMACHINE_AGENTS_DIR',

  // =============================================================================
  // Performance Tuning
  // =============================================================================

  /** Auth cache TTL in milliseconds */
  AUTH_CACHE_TTL_MS: 'CODEMACHINE_AUTH_CACHE_TTL_MS',

  // =============================================================================
  // Engine-Specific
  // =============================================================================

  /** Claude config directory */
  CLAUDE_CONFIG_DIR: 'CLAUDE_CONFIG_DIR',

  /** Claude OAuth token */
  CLAUDE_OAUTH_TOKEN: 'CLAUDE_CODE_OAUTH_TOKEN',

  /** CCR config directory */
  CCR_CONFIG_DIR: 'CCR_CONFIG_DIR',

  /** Codex home directory */
  CODEX_HOME: 'CODEX_HOME',

  /** Gemini API key */
  GEMINI_API_KEY: 'GEMINI_API_KEY',

  /** OpenCode home directory */
  OPENCODE_HOME: 'OPENCODE_HOME',
} as const;

/**
 * Get environment variable value with optional default
 */
export function getEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] ?? defaultValue;
}

/**
 * Get environment variable as boolean
 * Returns true for '1', 'true', 'yes' (case-insensitive)
 */
export function getEnvBoolean(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Get environment variable as integer
 */
export function getEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Check if debug mode is enabled
 * Checks both LOG_LEVEL=debug and DEBUG environment variables
 */
export function isDebugEnabled(): boolean {
  const logLevel = (process.env[ENV_VARS.LOG_LEVEL] || '').trim().toLowerCase();
  const debugFlag = (process.env[ENV_VARS.DEBUG] || '').trim().toLowerCase();

  return (
    logLevel === 'debug' ||
    (debugFlag !== '' && debugFlag !== '0' && debugFlag !== 'false')
  );
}

/**
 * Check if plain logs are enabled (no color/formatting)
 */
export function isPlainLogsEnabled(): boolean {
  return getEnvBoolean(ENV_VARS.PLAIN_LOGS);
}

/**
 * Check if authentication should be skipped (testing mode)
 */
export function shouldSkipAuth(): boolean {
  return getEnvBoolean(ENV_VARS.SKIP_AUTH);
}

/**
 * Get the current working directory (with override support)
 */
export function getWorkingDirectory(fallback: string = process.cwd()): string {
  return process.env[ENV_VARS.CWD] || fallback;
}

/**
 * Get the CodeMachine installation directory
 */
export function getInstallDirectory(): string | undefined {
  return process.env[ENV_VARS.INSTALL_DIR];
}

/**
 * Get parent agent ID (for child processes)
 */
export function getParentAgentId(): number | undefined {
  const value = process.env[ENV_VARS.PARENT_AGENT_ID];
  if (!value) return undefined;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}
