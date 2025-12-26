/**
 * Database-related errors
 *
 * Covers SQLite errors, storage failures, and data access issues.
 */

import { CodeMachineError } from './base.js';

/**
 * Base class for all database errors
 */
export class DatabaseError extends CodeMachineError {
  readonly code = 'DATABASE_ERROR';

  constructor(
    message: string,
    options?: { cause?: Error; recoverable?: boolean }
  ) {
    super(message, options);
  }
}

/**
 * Database is busy (SQLITE_BUSY)
 * This error is recoverable - retry with backoff
 */
export class DatabaseBusyError extends DatabaseError {
  readonly code = 'DATABASE_BUSY';

  constructor(operation?: string, cause?: Error) {
    const op = operation ? ` during ${operation}` : '';
    super(`Database is busy${op}. Retrying...`, {
      cause,
      recoverable: true,
    });
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
  readonly code = 'DATABASE_LOCKED';

  constructor(cause?: Error) {
    super('Database is locked by another connection', {
      cause,
      recoverable: true,
    });
  }
}

/**
 * Record not found
 */
export class RecordNotFoundError extends DatabaseError {
  readonly code = 'RECORD_NOT_FOUND';
  readonly table: string;
  readonly id: string | number;

  constructor(table: string, id: string | number) {
    super(`Record not found in ${table}: ${id}`);
    this.table = table;
    this.id = id;
  }
}

/**
 * Database connection failed
 */
export class DatabaseConnectionError extends DatabaseError {
  readonly code = 'DATABASE_CONNECTION_FAILED';
  readonly dbPath: string;

  constructor(dbPath: string, cause?: Error) {
    super(`Failed to connect to database: ${dbPath}`, {
      cause,
      recoverable: false,
    });
    this.dbPath = dbPath;
  }
}

/**
 * Database migration failed
 */
export class DatabaseMigrationError extends DatabaseError {
  readonly code = 'DATABASE_MIGRATION_FAILED';

  constructor(version: string | number, cause?: Error) {
    super(`Database migration failed at version ${version}`, {
      cause,
      recoverable: false,
    });
  }
}

/**
 * Transaction failed
 */
export class TransactionError extends DatabaseError {
  readonly code = 'TRANSACTION_FAILED';

  constructor(operation: string, cause?: Error) {
    super(`Transaction failed during ${operation}`, {
      cause,
      recoverable: true,
    });
  }
}
