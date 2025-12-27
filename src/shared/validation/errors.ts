/**
 * Validation Error Classes
 */

import { CodeMachineError } from '../errors/base.js';

/**
 * Base validation error
 */
export class ValidationError extends CodeMachineError {
  readonly code = 'VALIDATION_ERROR';
  readonly recoverable = false;

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    cause?: Error
  ) {
    super(message, cause);
  }

  static invalidType(field: string, expected: string, received: string): ValidationError {
    return new ValidationError(
      `Invalid type for '${field}': expected ${expected}, received ${received}`,
      field
    );
  }

  static required(field: string): ValidationError {
    return new ValidationError(`Required field '${field}' is missing`, field);
  }

  static invalidValue(field: string, value: unknown, reason: string): ValidationError {
    return new ValidationError(
      `Invalid value for '${field}': ${reason}`,
      field,
      value
    );
  }
}

/**
 * Path validation error
 */
export class PathValidationError extends ValidationError {
  readonly code = 'PATH_VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly path: string,
    cause?: Error
  ) {
    super(message, 'path', path, cause);
  }

  static notFound(path: string): PathValidationError {
    return new PathValidationError(`Path not found: ${path}`, path);
  }

  static notReadable(path: string): PathValidationError {
    return new PathValidationError(`Path not readable: ${path}`, path);
  }

  static notWritable(path: string): PathValidationError {
    return new PathValidationError(`Path not writable: ${path}`, path);
  }

  static invalidFormat(path: string, reason: string): PathValidationError {
    return new PathValidationError(`Invalid path format: ${reason}`, path);
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends ValidationError {
  readonly code = 'CONFIG_VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly configFile?: string,
    field?: string,
    value?: unknown,
    cause?: Error
  ) {
    super(message, field, value, cause);
  }

  static invalidSchema(configFile: string, errors: string[]): ConfigValidationError {
    return new ConfigValidationError(
      `Invalid configuration in ${configFile}:\n${errors.map(e => `  - ${e}`).join('\n')}`,
      configFile
    );
  }

  static missingRequired(configFile: string, field: string): ConfigValidationError {
    return new ConfigValidationError(
      `Missing required field '${field}' in ${configFile}`,
      configFile,
      field
    );
  }
}

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: ValidationError[];
}

/**
 * Create a successful validation result
 */
export function validResult<T>(value: T): ValidationResult<T> {
  return { valid: true, value, errors: [] };
}

/**
 * Create a failed validation result
 */
export function invalidResult<T>(errors: ValidationError[]): ValidationResult<T> {
  return { valid: false, errors };
}
