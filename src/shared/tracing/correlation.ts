/**
 * Correlation ID Generation and Management
 *
 * Provides unique identifiers for tracing requests across the system.
 */

import { randomBytes } from 'node:crypto';

/**
 * Correlation ID format options
 */
export type CorrelationIdFormat = 'uuid' | 'short' | 'prefixed';

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(format: CorrelationIdFormat = 'short'): string {
  switch (format) {
    case 'uuid':
      return generateUUID();
    case 'short':
      return generateShortId();
    case 'prefixed':
      return generatePrefixedId();
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  const bytes = randomBytes(16);
  // Set version (4) and variant (8, 9, a, or b)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate a short ID (12 characters)
 */
function generateShortId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * Generate a prefixed ID with timestamp
 */
function generatePrefixedId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Validate a correlation ID format
 */
export function isValidCorrelationId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return true;
  }

  // Short format (12 hex chars)
  if (/^[0-9a-f]{12}$/i.test(id)) {
    return true;
  }

  // Prefixed format (timestamp-random)
  if (/^[0-9a-z]+-[0-9a-f]{8}$/i.test(id)) {
    return true;
  }

  return false;
}

/**
 * Parse correlation ID from headers or string
 */
export function parseCorrelationId(
  source: string | Record<string, string | undefined>
): string | undefined {
  if (typeof source === 'string') {
    return isValidCorrelationId(source) ? source : undefined;
  }

  // Try common header names
  const headerNames = [
    'x-correlation-id',
    'x-request-id',
    'x-trace-id',
    'correlation-id',
    'request-id',
    'trace-id',
  ];

  for (const name of headerNames) {
    const value = source[name] || source[name.toLowerCase()];
    if (value && isValidCorrelationId(value)) {
      return value;
    }
  }

  return undefined;
}

/**
 * Create correlation ID headers for propagation
 */
export function createCorrelationHeaders(
  correlationId: string
): Record<string, string> {
  return {
    'x-correlation-id': correlationId,
    'x-request-id': correlationId,
  };
}
