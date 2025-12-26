/**
 * CodeMachine Error System
 *
 * Standardized error classes for consistent error handling across the codebase.
 *
 * Usage:
 *   import { EngineNotFoundError, DatabaseBusyError } from '@shared/errors';
 *
 *   throw new EngineNotFoundError('claude', ['codex', 'gemini']);
 *
 * Error hierarchy:
 *   CodeMachineError (base)
 *   ├── EngineError
 *   │   ├── EngineNotFoundError
 *   │   ├── NoEnginesRegisteredError
 *   │   ├── EngineAuthRequiredError
 *   │   ├── EngineCLINotInstalledError
 *   │   ├── EngineExecutionError
 *   │   ├── EngineTimeoutError
 *   │   └── EngineRateLimitError
 *   ├── ConfigError
 *   │   ├── AgentNotFoundError
 *   │   ├── AgentPromptConfigError
 *   │   ├── FileNotFoundError
 *   │   ├── InvalidConfigValueError
 *   │   └── MissingConfigError
 *   ├── DatabaseError
 *   │   ├── DatabaseBusyError
 *   │   ├── DatabaseLockedError
 *   │   ├── RecordNotFoundError
 *   │   ├── DatabaseConnectionError
 *   │   ├── DatabaseMigrationError
 *   │   └── TransactionError
 *   ├── WorkflowError
 *   │   ├── StepExecutionError
 *   │   ├── InvalidStepTypeError
 *   │   ├── FallbackAgentError
 *   │   ├── CoordinationError
 *   │   ├── InvalidCommandSyntaxError
 *   │   ├── WorkflowAbortedError
 *   │   └── PromptLoadError
 *   └── ValidationError
 *       ├── RequiredFieldError
 *       ├── InvalidFieldError
 *       ├── SpecificationError
 *       ├── PlaceholderError
 *       ├── EmptyContentError
 *       └── TypeCheckError
 */

// Base
import { CodeMachineError } from './base.js';
export { CodeMachineError } from './base.js';

// Engine errors
export {
  EngineError,
  EngineNotFoundError,
  NoEnginesRegisteredError,
  EngineAuthRequiredError,
  EngineCLINotInstalledError,
  EngineExecutionError,
  EngineTimeoutError,
  EngineRateLimitError,
} from './engine.js';

// Config errors
export {
  ConfigError,
  AgentNotFoundError,
  AgentPromptConfigError,
  FileNotFoundError,
  InvalidConfigValueError,
  MissingConfigError,
} from './config.js';

// Database errors
export {
  DatabaseError,
  DatabaseBusyError,
  DatabaseLockedError,
  RecordNotFoundError,
  DatabaseConnectionError,
  DatabaseMigrationError,
  TransactionError,
} from './database.js';

// Workflow errors
export {
  WorkflowError,
  StepExecutionError,
  InvalidStepTypeError,
  FallbackAgentError,
  CoordinationError,
  InvalidCommandSyntaxError,
  WorkflowAbortedError,
  PromptLoadError,
} from './workflow.js';

// Validation errors
export {
  ValidationError,
  RequiredFieldError,
  InvalidFieldError,
  SpecificationError,
  PlaceholderError,
  EmptyContentError,
  TypeCheckError,
} from './validation.js';

/**
 * Type guard to check if an error is a CodeMachine error
 */
export function isCodeMachineError(error: unknown): error is CodeMachineError {
  return error instanceof CodeMachineError;
}

/**
 * Type guard to check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof CodeMachineError) {
    return error.recoverable;
  }
  return false;
}

/**
 * Extract error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof CodeMachineError) {
    return error.code;
  }
  if (error instanceof Error) {
    return 'UNKNOWN_ERROR';
  }
  return 'INVALID_ERROR';
}
