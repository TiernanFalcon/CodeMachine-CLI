/**
 * Configuration-related errors
 *
 * Covers errors from agent configuration, project setup, and settings.
 */

import { CodeMachineError } from './base.js';

/**
 * Configuration error codes - union of all possible config error types
 */
export type ConfigErrorCode =
  | 'CONFIG_ERROR'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_PROMPT_CONFIG_ERROR'
  | 'FILE_NOT_FOUND'
  | 'INVALID_CONFIG_VALUE'
  | 'MISSING_CONFIG';

/**
 * Base class for all configuration errors
 */
export class ConfigError extends CodeMachineError {
  declare readonly code: ConfigErrorCode;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    // Default code for direct ConfigError instantiation
    (this as { code: ConfigErrorCode }).code = 'CONFIG_ERROR';
  }
}

/**
 * Agent not found in configuration
 */
export class AgentNotFoundError extends ConfigError {
  declare readonly code: 'AGENT_NOT_FOUND';
  readonly agentId: string;
  readonly availableAgents?: string[];

  constructor(agentId: string, availableAgents?: string[]) {
    const available = availableAgents?.length
      ? ` Available agents: ${availableAgents.join(', ')}`
      : '';
    super(`Unknown agent id: ${agentId}.${available}`);
    (this as { code: 'AGENT_NOT_FOUND' }).code = 'AGENT_NOT_FOUND';
    this.agentId = agentId;
    this.availableAgents = availableAgents;
  }
}

/**
 * Agent has invalid or missing prompt configuration
 */
export class AgentPromptConfigError extends ConfigError {
  declare readonly code: 'AGENT_PROMPT_CONFIG_ERROR';
  readonly agentId: string;

  constructor(agentId: string, issue: 'empty' | 'invalid' | 'missing') {
    const messages = {
      empty: `Agent ${agentId} has an empty promptPath configuration`,
      invalid: `Agent ${agentId} has an invalid promptPath configuration`,
      missing: `Agent ${agentId} is missing a promptPath configuration`,
    };
    super(messages[issue]);
    (this as { code: 'AGENT_PROMPT_CONFIG_ERROR' }).code = 'AGENT_PROMPT_CONFIG_ERROR';
    this.agentId = agentId;
  }
}

/**
 * Required file not found
 */
export class FileNotFoundError extends ConfigError {
  declare readonly code: 'FILE_NOT_FOUND';
  readonly filePath: string;

  constructor(filePath: string, context?: string) {
    const ctx = context ? ` (${context})` : '';
    super(`Required file not found: ${filePath}${ctx}`);
    (this as { code: 'FILE_NOT_FOUND' }).code = 'FILE_NOT_FOUND';
    this.filePath = filePath;
  }
}

/**
 * Invalid configuration value
 */
export class InvalidConfigValueError extends ConfigError {
  declare readonly code: 'INVALID_CONFIG_VALUE';
  readonly key: string;
  readonly value: unknown;

  constructor(key: string, value: unknown, expected?: string) {
    const exp = expected ? ` Expected: ${expected}` : '';
    super(`Invalid configuration value for '${key}': ${String(value)}.${exp}`);
    (this as { code: 'INVALID_CONFIG_VALUE' }).code = 'INVALID_CONFIG_VALUE';
    this.key = key;
    this.value = value;
  }
}

/**
 * Missing required configuration
 */
export class MissingConfigError extends ConfigError {
  declare readonly code: 'MISSING_CONFIG';
  readonly key: string;

  constructor(key: string, hint?: string) {
    const h = hint ? ` ${hint}` : '';
    super(`Missing required configuration: ${key}.${h}`);
    (this as { code: 'MISSING_CONFIG' }).code = 'MISSING_CONFIG';
    this.key = key;
  }
}
