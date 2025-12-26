/**
 * Engine-related errors
 *
 * Covers errors from engine providers, authentication, and execution.
 */

import { CodeMachineError } from './base.js';

/**
 * Base class for all engine-related errors
 */
export class EngineError extends CodeMachineError {
  readonly code = 'ENGINE_ERROR';
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
    this.engineId = options?.engineId;
  }
}

/**
 * Engine not found in registry
 */
export class EngineNotFoundError extends EngineError {
  readonly code = 'ENGINE_NOT_FOUND';

  constructor(engineId: string, availableEngines?: string[]) {
    const available = availableEngines?.length
      ? ` Available engines: ${availableEngines.join(', ')}`
      : '';
    super(`Engine not found: ${engineId}.${available}`, { engineId });
  }
}

/**
 * No engines registered in the system
 */
export class NoEnginesRegisteredError extends EngineError {
  readonly code = 'NO_ENGINES_REGISTERED';

  constructor() {
    super('No engines registered. Please install at least one engine.');
  }
}

/**
 * Engine authentication required
 */
export class EngineAuthRequiredError extends EngineError {
  readonly code = 'ENGINE_AUTH_REQUIRED';

  constructor(engineName: string, engineId: string) {
    super(
      `${engineName} authentication required. Run: codemachine auth login`,
      { engineId, recoverable: true }
    );
  }
}

/**
 * Engine CLI not installed
 */
export class EngineCLINotInstalledError extends EngineError {
  readonly code = 'ENGINE_CLI_NOT_INSTALLED';
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
    this.installInstructions = installInstructions;
  }
}

/**
 * Engine execution failed
 */
export class EngineExecutionError extends EngineError {
  readonly code = 'ENGINE_EXECUTION_FAILED';
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
    this.exitCode = options?.exitCode;
  }
}

/**
 * Engine execution timed out
 */
export class EngineTimeoutError extends EngineError {
  readonly code = 'ENGINE_TIMEOUT';
  readonly timeoutMs: number;

  constructor(engineId: string, timeoutMs: number) {
    super(`Engine execution timed out after ${timeoutMs}ms`, {
      engineId,
      recoverable: true,
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Engine rate limited
 */
export class EngineRateLimitError extends EngineError {
  readonly code = 'ENGINE_RATE_LIMITED';
  readonly retryAfterMs?: number;

  constructor(engineId: string, retryAfterMs?: number) {
    const retryMsg = retryAfterMs
      ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      : '';
    super(`Engine rate limited.${retryMsg}`, {
      engineId,
      recoverable: true,
    });
    this.retryAfterMs = retryAfterMs;
  }
}
