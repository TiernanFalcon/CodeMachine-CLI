/**
 * Database-related errors
 *
 * Covers SQLite errors, storage failures, and data access issues.
 */

import { CodeMachineError } from './base.js';

/**
 * Database error codes - union of all possible database error types
 */
export type DatabaseErrorCode =
  | 'DATABASE_ERROR'
  | 'DATABASE_BUSY'
  | 'DATABASE_LOCKED'
  | 'RECORD_NOT_FOUND'
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_MIGRATION_FAILED'
  | 'TRANSACTION_FAILED';

/**
 * Base class for all database errors
 */
export class DatabaseError extends CodeMachineError {
  declare readonly code: DatabaseErrorCode;

  constructor(
    message: string,
    options?: { cause?: Error; recoverable?: boolean }
  ) {
    super(message, options);
    (this as { code: DatabaseErrorCode }).code = 'DATABASE_ERROR';
  }
}

/**
 * Database is busy (SQLITE_BUSY)
 * This error is recoverable - retry with backoff
 */
export class DatabaseBusyError extends DatabaseError {
  declare readonly code: 'DATABASE_BUSY';

  constructor(operation?: string, cause?: Error) {
    const op = operation ? ` during ${operation}` : '';
    super(`Database is busy${op}. Retrying...`, {
      cause,
      recoverable: true,
    });
    (this as { code: 'DATABASE_BUSY' }).code = 'DATABASE_BUSY';
  }

  /**
   * Check if an error is a SQLite BUSY error
   */
  static isBusyError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('sqlite_busy') ||
        msg.includes('database is locked') ||
        msg.includes('database is busy')
      );
    }
    return false;
  }
}

/**
 * Database locked (SQLITE_LOCKED)
 */
export class DatabaseLockedError extends DatabaseError {
  declare readonly code: 'DATABASE_LOCKED';

  constructor(cause?: Error) {
    super('Database is locked by another connection', {
      cause,
      recoverable: true,
    });
    (this as { code: 'DATABASE_LOCKED' }).code = 'DATABASE_LOCKED';
  }
}

/**
 * Record not found
 */
export class RecordNotFoundError extends DatabaseError {
  declare readonly code: 'RECORD_NOT_FOUND';
  readonly table: string;
  readonly id: string | number;

  constructor(table: string, id: string | number) {
    super(`Record not found in ${table}: ${id}`);
    (this as { code: 'RECORD_NOT_FOUND' }).code = 'RECORD_NOT_FOUND';
    this.table = table;
    this.id = id;
  }
}

/**
 * Database connection failed
 */
export class DatabaseConnectionError extends DatabaseError {
  declare readonly code: 'DATABASE_CONNECTION_FAILED';
  readonly dbPath: string;

  constructor(dbPath: string, cause?: Error) {
    super(`Failed to connect to database: ${dbPath}`, {
      cause,
      recoverable: false,
    });
    (this as { code: 'DATABASE_CONNECTION_FAILED' }).code = 'DATABASE_CONNECTION_FAILED';
    this.dbPath = dbPath;
  }
}

/**
 * Database migration failed
 */
export class DatabaseMigrationError extends DatabaseError {
  declare readonly code: 'DATABASE_MIGRATION_FAILED';

  constructor(version: string | number, cause?: Error) {
    super(`Database migration failed at version ${version}`, {
      cause,
      recoverable: false,
    });
    (this as { code: 'DATABASE_MIGRATION_FAILED' }).code = 'DATABASE_MIGRATION_FAILED';
  }
}

/**
 * Transaction failed
 */
export class TransactionError extends DatabaseError {
  declare readonly code: 'TRANSACTION_FAILED';

  constructor(operation: string, cause?: Error) {
    super(`Transaction failed during ${operation}`, {
      cause,
      recoverable: true,
    });
    (this as { code: 'TRANSACTION_FAILED' }).code = 'TRANSACTION_FAILED';
  }
}
