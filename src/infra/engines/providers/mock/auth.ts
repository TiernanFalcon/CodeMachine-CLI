/**
 * Mock Engine Authentication
 *
 * Always returns authenticated for testing purposes.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MockAuthOptions {
  // No options needed - interface kept for API consistency
}

/**
 * Check if mock engine is authenticated (always true)
 */
export async function isAuthenticated(_options?: MockAuthOptions): Promise<boolean> {
  return true;
}

/**
 * Ensure authentication (always succeeds)
 */
export async function ensureAuth(_options?: MockAuthOptions): Promise<boolean> {
  return true;
}

/**
 * Clear authentication (no-op)
 */
export async function clearAuth(_options?: MockAuthOptions): Promise<void> {
  // No-op for mock engine
}

/**
 * Next auth menu action (always logout since always authenticated)
 */
export async function nextAuthMenuAction(_options?: MockAuthOptions): Promise<'login' | 'logout'> {
  return 'logout';
}
