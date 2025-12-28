/**
 * Input Validators
 *
 * Reusable validation functions for common input types.
 */

import { stat, access, constants } from 'node:fs/promises';
import * as path from 'node:path';
import { ValidationError, PathValidationError, ValidationResult, validResult, invalidResult } from './errors.js';

// =============================================================================
// String Validators
// =============================================================================

/**
 * Validate that a value is a non-empty string
 */
export function validateNonEmptyString(value: unknown, fieldName: string): ValidationResult<string> {
  if (typeof value !== 'string') {
    return invalidResult([ValidationError.invalidType(fieldName, 'string', typeof value)]);
  }
  if (value.trim().length === 0) {
    return invalidResult([ValidationError.invalidValue(fieldName, value, 'cannot be empty')]);
  }
  return validResult(value.trim());
}

/**
 * Validate string length within bounds
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  options: { min?: number; max?: number }
): ValidationResult<string> {
  const { min = 0, max = Infinity } = options;

  if (value.length < min) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, `must be at least ${min} characters`)
    ]);
  }
  if (value.length > max) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, `must be at most ${max} characters`)
    ]);
  }
  return validResult(value);
}

/**
 * Validate string matches a pattern
 */
export function validatePattern(
  value: string,
  fieldName: string,
  pattern: RegExp,
  patternDescription: string
): ValidationResult<string> {
  if (!pattern.test(value)) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, `must match ${patternDescription}`)
    ]);
  }
  return validResult(value);
}

// =============================================================================
// Identifier Validators
// =============================================================================

/** Valid identifier pattern: alphanumeric, hyphens, underscores */
const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Validate an identifier (agent ID, engine ID, etc.)
 */
export function validateIdentifier(value: unknown, fieldName: string): ValidationResult<string> {
  const stringResult = validateNonEmptyString(value, fieldName);
  if (!stringResult.valid) return stringResult;

  return validatePattern(
    stringResult.value!,
    fieldName,
    IDENTIFIER_PATTERN,
    'alphanumeric identifier starting with a letter'
  );
}

/**
 * Validate an agent ID
 */
export function validateAgentId(value: unknown): ValidationResult<string> {
  return validateIdentifier(value, 'agentId');
}

/**
 * Validate an engine type
 */
export function validateEngineType(
  value: unknown,
  validEngines: string[]
): ValidationResult<string> {
  const stringResult = validateNonEmptyString(value, 'engine');
  if (!stringResult.valid) return stringResult;

  const engine = stringResult.value!.toLowerCase();
  if (!validEngines.includes(engine)) {
    return invalidResult([
      ValidationError.invalidValue(
        'engine',
        value,
        `must be one of: ${validEngines.join(', ')}`
      )
    ]);
  }
  return validResult(engine);
}

// =============================================================================
// Path Validators
// =============================================================================

/**
 * Validate that a path is absolute
 */
export function validateAbsolutePath(value: unknown, fieldName: string): ValidationResult<string> {
  const stringResult = validateNonEmptyString(value, fieldName);
  if (!stringResult.valid) return stringResult;

  const pathValue = stringResult.value!;
  if (!path.isAbsolute(pathValue)) {
    return invalidResult([
      PathValidationError.invalidFormat(pathValue, 'path must be absolute')
    ]);
  }
  return validResult(pathValue);
}

/**
 * Validate that a path exists
 */
export async function validatePathExists(
  pathValue: string,
  _fieldName: string = 'path'
): Promise<ValidationResult<string>> {
  try {
    await stat(pathValue);
    return validResult(pathValue);
  } catch {
    return invalidResult([PathValidationError.notFound(pathValue)]);
  }
}

/**
 * Validate that a path is readable
 */
export async function validatePathReadable(
  pathValue: string,
  _fieldName: string = 'path'
): Promise<ValidationResult<string>> {
  try {
    await access(pathValue, constants.R_OK);
    return validResult(pathValue);
  } catch {
    return invalidResult([PathValidationError.notReadable(pathValue)]);
  }
}

/**
 * Validate that a path is writable
 */
export async function validatePathWritable(
  pathValue: string,
  _fieldName: string = 'path'
): Promise<ValidationResult<string>> {
  try {
    await access(pathValue, constants.W_OK);
    return validResult(pathValue);
  } catch {
    return invalidResult([PathValidationError.notWritable(pathValue)]);
  }
}

/**
 * Validate a file path exists and is readable
 */
export async function validateFilePath(
  value: unknown,
  fieldName: string = 'filePath'
): Promise<ValidationResult<string>> {
  const stringResult = validateNonEmptyString(value, fieldName);
  if (!stringResult.valid) return stringResult;

  const pathValue = stringResult.value!;

  const existsResult = await validatePathExists(pathValue, fieldName);
  if (!existsResult.valid) return existsResult;

  return validatePathReadable(pathValue, fieldName);
}

/**
 * Validate a directory path exists
 */
export async function validateDirectoryPath(
  value: unknown,
  fieldName: string = 'directory'
): Promise<ValidationResult<string>> {
  const stringResult = validateNonEmptyString(value, fieldName);
  if (!stringResult.valid) return stringResult;

  const pathValue = stringResult.value!;

  try {
    const stats = await stat(pathValue);
    if (!stats.isDirectory()) {
      return invalidResult([
        PathValidationError.invalidFormat(pathValue, 'path is not a directory')
      ]);
    }
    return validResult(pathValue);
  } catch {
    return invalidResult([PathValidationError.notFound(pathValue)]);
  }
}

// =============================================================================
// Number Validators
// =============================================================================

/**
 * Validate a number is within range
 */
export function validateNumberRange(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number }
): ValidationResult<number> {
  const { min = -Infinity, max = Infinity } = options;

  if (typeof value !== 'number' || isNaN(value)) {
    return invalidResult([ValidationError.invalidType(fieldName, 'number', typeof value)]);
  }

  if (value < min) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, `must be at least ${min}`)
    ]);
  }
  if (value > max) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, `must be at most ${max}`)
    ]);
  }
  return validResult(value);
}

/**
 * Validate a positive integer
 */
export function validatePositiveInteger(
  value: unknown,
  fieldName: string
): ValidationResult<number> {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return invalidResult([ValidationError.invalidType(fieldName, 'integer', typeof value)]);
  }

  if (value <= 0) {
    return invalidResult([
      ValidationError.invalidValue(fieldName, value, 'must be a positive integer')
    ]);
  }
  return validResult(value);
}

// =============================================================================
// Object Validators
// =============================================================================

/**
 * Validate that a value is a non-null object
 */
export function validateObject(
  value: unknown,
  fieldName: string
): ValidationResult<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResult([ValidationError.invalidType(fieldName, 'object', typeof value)]);
  }
  return validResult(value as Record<string, unknown>);
}

/**
 * Validate that a value is an array
 */
export function validateArray<T>(
  value: unknown,
  fieldName: string
): ValidationResult<T[]> {
  if (!Array.isArray(value)) {
    return invalidResult([ValidationError.invalidType(fieldName, 'array', typeof value)]);
  }
  return validResult(value as T[]);
}

// =============================================================================
// Enum Validators
// =============================================================================

/**
 * Validate a value is one of allowed values
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): ValidationResult<T> {
  const stringResult = validateNonEmptyString(value, fieldName);
  if (!stringResult.valid) return stringResult as ValidationResult<T>;

  const stringValue = stringResult.value!;
  if (!allowedValues.includes(stringValue as T)) {
    return invalidResult([
      ValidationError.invalidValue(
        fieldName,
        value,
        `must be one of: ${allowedValues.join(', ')}`
      )
    ]);
  }
  return validResult(stringValue as T);
}

// =============================================================================
// Composition Helpers
// =============================================================================

/**
 * Combine multiple validation results
 */
export function combineResults<T>(results: ValidationResult<unknown>[]): ValidationResult<T> {
  const errors = results.flatMap(r => r.errors);
  if (errors.length > 0) {
    return invalidResult(errors);
  }
  return validResult(undefined as unknown as T);
}

/**
 * Validate optional field (returns valid if undefined/null)
 */
export function validateOptional<T>(
  value: unknown,
  validator: (v: unknown) => ValidationResult<T>
): ValidationResult<T | undefined> {
  if (value === undefined || value === null) {
    return validResult(undefined);
  }
  return validator(value);
}
