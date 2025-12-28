/**
 * Engine-related errors
 *
 * Covers errors from engine providers, authentication, and execution.
 */

import { CodeMachineError } from './base.js';

/**
 * Engine error codes - union of all possible engine error types
 */
export type EngineErrorCode =
  | 'ENGINE_ERROR'
  | 'ENGINE_NOT_FOUND'
  | 'NO_ENGINES_REGISTERED'
  | 'ENGINE_AUTH_REQUIRED'
  | 'ENGINE_CLI_NOT_INSTALLED'
  | 'ENGINE_EXECUTION_FAILED'
  | 'ENGINE_TIMEOUT'
  | 'ENGINE_RATE_LIMITED';

/**
 * Base class for all engine-related errors
 */
export class EngineError extends CodeMachineError {
  declare readonly code: EngineErrorCode;
  readonly engineId?: string;

  constructor(
    message: string,
    options?: {
      engineId?: string;
      cause?: Error;
      recoverable?: boolean;
    }
  ) {
    super(message, options);
    (this as { code: EngineErrorCode }).code = 'ENGINE_ERROR';
    this.engineId = options?.engineId;
  }
}

/**
 * Engine not found in registry
 */
export class EngineNotFoundError extends EngineError {
  declare readonly code: 'ENGINE_NOT_FOUND';

  constructor(engineId: string, availableEngines?: string[]) {
    const available = availableEngines?.length
      ? ` Available engines: ${availableEngines.join(', ')}`
      : '';
    super(`Engine not found: ${engineId}.${available}`, { engineId });
    (this as { code: 'ENGINE_NOT_FOUND' }).code = 'ENGINE_NOT_FOUND';
  }
}

/**
 * No engines registered in the system
 */
export class NoEnginesRegisteredError extends EngineError {
  declare readonly code: 'NO_ENGINES_REGISTERED';

  constructor() {
    super('No engines registered. Please install at least one engine.');
    (this as { code: 'NO_ENGINES_REGISTERED' }).code = 'NO_ENGINES_REGISTERED';
  }
}

/**
 * Engine authentication required
 */
export class EngineAuthRequiredError extends EngineError {
  declare readonly code: 'ENGINE_AUTH_REQUIRED';

  constructor(engineName: string, engineId: string) {
    super(
      `${engineName} authentication required. Run: codemachine auth login`,
      { engineId, recoverable: true }
    );
    (this as { code: 'ENGINE_AUTH_REQUIRED' }).code = 'ENGINE_AUTH_REQUIRED';
  }
}

/**
 * Engine CLI not installed
 */
export class EngineCLINotInstalledError extends EngineError {
  declare readonly code: 'ENGINE_CLI_NOT_INSTALLED';
  readonly installInstructions?: string;

  constructor(
    engineName: string,
    engineId: string,
    installInstructions?: string
  ) {
    const instructions = installInstructions
      ? `\n  ${installInstructions}`
      : '';
    super(`${engineName} CLI is not installed.${instructions}`, {
      engineId,
      recoverable: true,
    });
    (this as { code: 'ENGINE_CLI_NOT_INSTALLED' }).code = 'ENGINE_CLI_NOT_INSTALLED';
    this.installInstructions = installInstructions;
  }
}

/**
 * Engine execution failed
 */
export class EngineExecutionError extends EngineError {
  declare readonly code: 'ENGINE_EXECUTION_FAILED';
  readonly exitCode?: number;

  constructor(
    engineId: string,
    message: string,
    options?: {
      exitCode?: number;
      cause?: Error;
    }
  ) {
    super(message, { engineId, cause: options?.cause });
    (this as { code: 'ENGINE_EXECUTION_FAILED' }).code = 'ENGINE_EXECUTION_FAILED';
    this.exitCode = options?.exitCode;
  }
}

/**
 * Engine execution timed out
 */
export class EngineTimeoutError extends EngineError {
  declare readonly code: 'ENGINE_TIMEOUT';
  readonly timeoutMs: number;

  constructor(engineId: string, timeoutMs: number) {
    super(`Engine execution timed out after ${timeoutMs}ms`, {
      engineId,
      recoverable: true,
    });
    (this as { code: 'ENGINE_TIMEOUT' }).code = 'ENGINE_TIMEOUT';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Engine rate limited
 */
export class EngineRateLimitError extends EngineError {
  declare readonly code: 'ENGINE_RATE_LIMITED';
  readonly retryAfterMs?: number;

  constructor(engineId: string, retryAfterMs?: number) {
    const retryMsg = retryAfterMs
      ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      : '';
    super(`Engine rate limited.${retryMsg}`, {
      engineId,
      recoverable: true,
    });
    (this as { code: 'ENGINE_RATE_LIMITED' }).code = 'ENGINE_RATE_LIMITED';
    this.retryAfterMs = retryAfterMs;
  }
}
