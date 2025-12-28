/**
 * Configuration Validator
 *
 * Validates configuration at startup including environment variables,
 * configuration files, and paths.
 */

import { readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  validateAgentConfig,
  validateEnvironmentVariables,
  type EnvVarRequirement,
} from '../../shared/validation/schemas.js';
import {
  validateFilePath,
  validateDirectoryPath,
} from '../../shared/validation/validators.js';
import {
  ValidationError,
  ConfigValidationError,
  type ValidationResult,
  validResult,
  invalidResult,
} from '../../shared/validation/errors.js';
import { getCodemachinePaths, getCodemachineFiles } from '../../shared/config/paths.js';
import { ENV_VARS } from '../../shared/config/env.js';
import { warn, debug, error as logError } from '../../shared/logging/logger.js';

// =============================================================================
// Types
// =============================================================================

export interface ConfigValidationReport {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  config: {
    environment: Record<string, string>;
    paths: Record<string, string>;
    agents: string[];
  };
}

export interface ConfigValidatorOptions {
  /** Skip environment variable validation */
  skipEnv?: boolean;
  /** Skip path validation */
  skipPaths?: boolean;
  /** Skip agent config validation */
  skipAgents?: boolean;
  /** Continue validation even if errors found */
  continueOnError?: boolean;
}

// =============================================================================
// Environment Variable Validation
// =============================================================================

const ENV_REQUIREMENTS: EnvVarRequirement[] = [
  // Optional but validated if present
  {
    name: ENV_VARS.AUTH_CACHE_TTL_MS,
    required: false,
    validator: (v) => {
      const num = parseInt(v, 10);
      if (isNaN(num) || num <= 0) {
        return invalidResult([
          ValidationError.invalidValue(
            ENV_VARS.AUTH_CACHE_TTL_MS,
            v,
            'must be a positive integer'
          ),
        ]);
      }
      return validResult(v);
    },
    description: 'Auth cache TTL in milliseconds',
  },
  {
    name: ENV_VARS.LOG_LEVEL,
    required: false,
    validator: (v) => {
      const valid = ['debug', 'info', 'warn', 'error'];
      if (!valid.includes(v.toLowerCase())) {
        return invalidResult([
          ValidationError.invalidValue(
            ENV_VARS.LOG_LEVEL,
            v,
            `must be one of: ${valid.join(', ')}`
          ),
        ]);
      }
      return validResult(v);
    },
    description: 'Logging level',
  },
];

/**
 * Validate environment variables
 */
function validateEnv(): ValidationResult<Record<string, string>> {
  return validateEnvironmentVariables(ENV_REQUIREMENTS);
}

// =============================================================================
// Path Validation
// =============================================================================

/**
 * Validate workspace paths
 */
async function validatePaths(cwd: string): Promise<{
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  paths: Record<string, string>;
}> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const paths = getCodemachinePaths(cwd);
  const files = getCodemachineFiles(cwd);

  // Check CWD is accessible
  const cwdResult = await validateDirectoryPath(cwd, 'working directory');
  if (!cwdResult.valid) {
    errors.push(...cwdResult.errors);
  }

  // Check .codemachine exists (warn if not)
  try {
    await stat(paths.root);
  } catch {
    warnings.push(
      `.codemachine directory not found at ${paths.root}. ` +
        'It will be created on first workflow run.'
    );
  }

  // Check specifications file if it exists
  try {
    await stat(files.specifications);
    const specResult = await validateFilePath(files.specifications, 'specifications');
    if (!specResult.valid) {
      warnings.push(`Specifications file exists but is not readable: ${files.specifications}`);
    }
  } catch {
    // Specifications file is optional
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    paths: {
      root: paths.root,
      agents: paths.agents,
      logs: paths.logs,
      memory: paths.memory,
    },
  };
}

// =============================================================================
// Agent Configuration Validation
// =============================================================================

/**
 * Validate agent configurations
 */
async function validateAgentConfigs(agentsDir: string): Promise<{
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  agents: string[];
}> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const validAgents: string[] = [];

  try {
    // Check if agents directory exists
    await stat(agentsDir);

    // Find all agent directories
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(agentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentDir = path.join(agentsDir, entry.name);
      const configPath = path.join(agentDir, 'config.json');

      try {
        await stat(configPath);
        const content = await readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        const result = validateAgentConfig(config, configPath);
        if (!result.valid) {
          errors.push(...result.errors);
        } else {
          validAgents.push(entry.name);
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // No config.json - might be a prompt-based agent
          const promptPath = path.join(agentDir, 'prompt.md');
          try {
            await stat(promptPath);
            validAgents.push(entry.name);
          } catch {
            warnings.push(`Agent directory '${entry.name}' has no config.json or prompt.md`);
          }
        } else if (err instanceof SyntaxError) {
          errors.push(
            new ConfigValidationError(
              `Invalid JSON in ${configPath}: ${err.message}`,
              configPath
            )
          );
        } else {
          warnings.push(`Could not read agent config for '${entry.name}': ${err}`);
        }
      }
    }
  } catch {
    // Agents directory doesn't exist - not an error for first run
    warnings.push(`Agents directory not found at ${agentsDir}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    agents: validAgents,
  };
}

// =============================================================================
// Main Validator
// =============================================================================

/**
 * Run comprehensive configuration validation
 */
export async function validateConfiguration(
  cwd: string = process.cwd(),
  options: ConfigValidatorOptions = {}
): Promise<ConfigValidationReport> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const config: ConfigValidationReport['config'] = {
    environment: {},
    paths: {},
    agents: [],
  };

  // Validate environment variables
  if (!options.skipEnv) {
    const envResult = validateEnv();
    if (!envResult.valid) {
      errors.push(...envResult.errors);
    } else {
      config.environment = envResult.value!;
    }
  }

  // Validate paths
  if (!options.skipPaths) {
    const pathsResult = await validatePaths(cwd);
    if (!pathsResult.valid) {
      errors.push(...pathsResult.errors);
    }
    warnings.push(...pathsResult.warnings);
    config.paths = pathsResult.paths;
  }

  // Validate agent configurations
  if (!options.skipAgents) {
    const paths = getCodemachinePaths(cwd);
    const agentsResult = await validateAgentConfigs(paths.agents);
    if (!agentsResult.valid) {
      errors.push(...agentsResult.errors);
    }
    warnings.push(...agentsResult.warnings);
    config.agents = agentsResult.agents;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * Validate configuration and log results
 */
export async function validateConfigurationWithLogging(
  cwd: string = process.cwd(),
  options: ConfigValidatorOptions = {}
): Promise<ConfigValidationReport> {
  debug('Validating configuration...');

  const report = await validateConfiguration(cwd, options);

  // Log warnings
  for (const warning of report.warnings) {
    warn(`[Config] ${warning}`);
  }

  // Log errors
  for (const error of report.errors) {
    logError(`[Config] ${error.message}`);
  }

  // Log summary
  if (report.valid) {
    debug(
      `Configuration valid: ${report.config.agents.length} agents, ` +
        `${Object.keys(report.config.paths).length} paths configured`
    );
  } else {
    logError(
      `Configuration invalid: ${report.errors.length} error(s), ` +
        `${report.warnings.length} warning(s)`
    );
  }

  return report;
}

/**
 * Quick configuration check - returns true if valid
 */
export async function isConfigurationValid(cwd: string = process.cwd()): Promise<boolean> {
  const report = await validateConfiguration(cwd);
  return report.valid;
}
