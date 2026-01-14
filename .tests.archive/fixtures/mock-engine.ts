/**
 * Mock Engine for Testing
 *
 * Provides a mock engine implementation for deterministic testing
 * of workflow execution without requiring real API calls.
 */

import type { EngineModule } from '../../src/infra/engines/core/base.js';

export interface MockEngineOptions {
  /** Delay before responding (ms) */
  responseDelay?: number;
  /** Responses to return for each call */
  responses?: string[];
  /** Whether to simulate authentication */
  authenticated?: boolean;
  /** Error to throw on specific call index */
  errorOnCall?: { index: number; error: Error };
}

/**
 * Create a mock engine for testing
 */
export function createMockEngine(options: MockEngineOptions = {}): EngineModule {
  const {
    responseDelay = 0,
    responses = ['Mock response'],
    authenticated = true,
    errorOnCall,
  } = options;

  let callCount = 0;

  return {
    metadata: {
      id: 'mock',
      name: 'Mock Engine',
      description: 'Mock engine for testing',
      cliCommand: 'mock',
      cliBinary: 'mock',
      installCommand: 'npm install mock',
      defaultModel: 'mock-model',
      order: 999,
    },

    auth: {
      isAuthenticated: async () => authenticated,
      ensureAuth: async () => authenticated,
      clearAuth: async () => {},
      nextAuthMenuAction: async () => (authenticated ? 'logout' : 'login'),
    },

    run: async function* (_options) {
      const currentCall = callCount++;

      // Check if we should throw an error
      if (errorOnCall && currentCall === errorOnCall.index) {
        throw errorOnCall.error;
      }

      // Simulate delay
      if (responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, responseDelay));
      }

      // Get response for this call
      const response = responses[currentCall % responses.length];

      // Yield chunks to simulate streaming
      const words = response.split(' ');
      for (const word of words) {
        yield {
          type: 'text' as const,
          content: word + ' ',
        };
      }

      // Yield final result
      yield {
        type: 'result' as const,
        content: response,
        subagent: false,
      };
    },
  };
}

/**
 * Create a mock engine that simulates failures
 */
export function createFailingMockEngine(error: Error, failAfterCalls: number = 0): EngineModule {
  let callCount = 0;

  return {
    metadata: {
      id: 'failing-mock',
      name: 'Failing Mock Engine',
      description: 'Mock engine that fails for testing',
      cliCommand: 'mock',
      cliBinary: 'mock',
      installCommand: 'npm install mock',
      defaultModel: 'mock-model',
      order: 999,
    },

    auth: {
      isAuthenticated: async () => true,
      ensureAuth: async () => true,
      clearAuth: async () => {},
      nextAuthMenuAction: async () => 'logout',
    },

    run: async function* (_options) {
      callCount++;

      if (callCount > failAfterCalls) {
        throw error;
      }

      yield {
        type: 'result' as const,
        content: 'Success before failure',
        subagent: false,
      };
    },
  };
}

/**
 * Create a mock engine with rate limiting simulation
 */
export function createRateLimitedMockEngine(rateLimitAfterCalls: number): EngineModule {
  let callCount = 0;

  return {
    metadata: {
      id: 'rate-limited-mock',
      name: 'Rate Limited Mock Engine',
      description: 'Mock engine that simulates rate limiting',
      cliCommand: 'mock',
      cliBinary: 'mock',
      installCommand: 'npm install mock',
      defaultModel: 'mock-model',
      order: 999,
    },

    auth: {
      isAuthenticated: async () => true,
      ensureAuth: async () => true,
      clearAuth: async () => {},
      nextAuthMenuAction: async () => 'logout',
    },

    run: async function* (_options) {
      callCount++;

      if (callCount > rateLimitAfterCalls) {
        const error = new Error('Rate limit exceeded') as Error & { code?: string; retryAfter?: number };
        error.code = 'RATE_LIMIT';
        error.retryAfter = 60;
        throw error;
      }

      yield {
        type: 'result' as const,
        content: `Response ${callCount}`,
        subagent: false,
      };
    },
  };
}
