/**
 * Validation-related errors
 *
 * Covers input validation, data integrity, and format errors.
 */

import { CodeMachineError } from './base.js';

/**
 * Base class for all validation errors
 */
export class ValidationError extends CodeMachineError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Required field is missing or empty
 */
export class RequiredFieldError extends ValidationError {
  readonly code = 'REQUIRED_FIELD';
  readonly fieldName: string;

  constructor(fieldName: string, context?: string) {
    const ctx = context ? ` in ${context}` : '';
    super(`Required field '${fieldName}' is missing or empty${ctx}`);
    this.fieldName = fieldName;
  }
}

/**
 * Field value is invalid
 */
export class InvalidFieldError extends ValidationError {
  readonly code = 'INVALID_FIELD';
  readonly fieldName: string;
  readonly value: unknown;

  constructor(fieldName: string, value: unknown, reason?: string) {
    const r = reason ? `: ${reason}` : '';
    super(`Invalid value for '${fieldName}'${r}`);
    this.fieldName = fieldName;
    this.value = value;
  }
}

/**
 * Specification file validation failed
 */
export class SpecificationError extends ValidationError {
  readonly code = 'SPECIFICATION_ERROR';
  readonly specPath: string;

  constructor(specPath: string, issue: 'not_found' | 'empty' | 'template') {
    const messages = {
      not_found: `Spec file not found at: ${specPath}`,
      empty: `Spec file is empty: ${specPath}`,
      template: `Spec file still contains default template: ${specPath}`,
    };
    super(
      `${messages[issue]}\n\nPlease add your project requirements:\n` +
      `1. Open the file in your editor\n` +
      `2. Describe your goals and constraints\n` +
      `3. Save and run /start again`
    );
    this.specPath = specPath;
  }
}

/**
 * Placeholder processing error
 */
export class PlaceholderError extends ValidationError {
  readonly code = 'PLACEHOLDER_ERROR';
  readonly placeholderName: string;
  readonly filePath: string;

  constructor(placeholderName: string, filePath: string) {
    super(`Required file not found: {${placeholderName}}\n\nExpected file: ${filePath}`);
    this.placeholderName = placeholderName;
    this.filePath = filePath;
  }
}

/**
 * Empty content where non-empty is required
 */
export class EmptyContentError extends ValidationError {
  readonly code = 'EMPTY_CONTENT';
  readonly context: string;

  constructor(context: string) {
    super(`${context} cannot be empty`);
    this.context = context;
  }
}

/**
 * Type check failed
 */
export class TypeCheckError extends ValidationError {
  readonly code = 'TYPE_CHECK_FAILED';
  readonly expected: string;
  readonly actual: string;

  constructor(fieldName: string, expected: string, actual: string) {
    super(`Type error for '${fieldName}': expected ${expected}, got ${actual}`);
    this.expected = expected;
    this.actual = actual;
  }
}
