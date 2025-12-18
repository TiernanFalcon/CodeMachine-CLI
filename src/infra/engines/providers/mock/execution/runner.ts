/**
 * Mock Engine Runner
 *
 * Provides scriptable, deterministic responses for testing.
 * Supports static responses, scripted sequences, and callback mode.
 */

import type { EngineRunOptions, EngineRunResult, ParsedTelemetry } from '../../../core/types.js';

/**
 * A single mock response
 */
export interface MockResponse {
  /** The output text to return */
  output: string;
  /** Optional chunks for streaming simulation */
  chunks?: string[];
  /** Optional telemetry data */
  telemetry?: ParsedTelemetry;
  /** Delay before returning (ms) */
  delay?: number;
  /** Simulate rate limit error */
  isRateLimitError?: boolean;
  /** Retry after seconds (for rate limit) */
  retryAfterSeconds?: number;
  /** Simulate generic error */
  error?: string;
}

/**
 * Mock engine configuration
 */
export interface MockEngineConfig {
  /** Response mode */
  mode: 'static' | 'scripted' | 'callback';

  /** For static mode: return same response every time */
  staticResponse?: string;

  /** For scripted mode: sequence of responses */
  scriptedResponses?: MockResponse[];

  /** For callback mode: custom function */
  responseCallback?: (prompt: string, options: EngineRunOptions) => Promise<MockResponse>;

  /** Delay between stream chunks (ms) */
  streamDelay?: number;

  /** Default telemetry to return */
  defaultTelemetry?: ParsedTelemetry;

  /** Simulate rate limit after N calls */
  rateLimitAfterCalls?: number;
}

// Global configuration - can be modified by tests
let globalConfig: MockEngineConfig = {
  mode: 'static',
  staticResponse: 'Mock response',
  streamDelay: 0,
};

// Call counter for rate limit simulation
let callCount = 0;

/**
 * Set the global mock configuration
 */
export function setMockConfig(config: Partial<MockEngineConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Reset mock configuration to defaults
 */
export function resetMockConfig(): void {
  globalConfig = {
    mode: 'static',
    staticResponse: 'Mock response',
    streamDelay: 0,
  };
  callCount = 0;
}

/**
 * Get current call count
 */
export function getCallCount(): number {
  return callCount;
}

/**
 * Get a response based on current configuration
 */
async function getResponse(prompt: string, options: EngineRunOptions): Promise<MockResponse> {
  callCount++;

  // Check for rate limit simulation
  if (globalConfig.rateLimitAfterCalls && callCount > globalConfig.rateLimitAfterCalls) {
    return {
      output: '',
      isRateLimitError: true,
      retryAfterSeconds: 60,
    };
  }

  switch (globalConfig.mode) {
    case 'static':
      return {
        output: globalConfig.staticResponse ?? 'Mock response',
        telemetry: globalConfig.defaultTelemetry,
      };

    case 'scripted': {
      const responses = globalConfig.scriptedResponses ?? [];
      const index = Math.min(callCount - 1, responses.length - 1);
      return responses[index] ?? { output: 'No more scripted responses' };
    }

    case 'callback':
      if (globalConfig.responseCallback) {
        return await globalConfig.responseCallback(prompt, options);
      }
      return { output: 'No callback configured' };

    default:
      return { output: 'Unknown mode' };
  }
}

/**
 * Simulate streaming by emitting chunks with delays
 */
async function streamResponse(
  response: MockResponse,
  onData: ((chunk: string) => void) | undefined,
  streamDelay: number
): Promise<void> {
  const chunks = response.chunks ?? [response.output];

  for (const chunk of chunks) {
    if (streamDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, streamDelay));
    }
    onData?.(chunk);
  }
}

/**
 * Run the mock engine
 */
export async function runMock(options: EngineRunOptions): Promise<EngineRunResult> {
  const { prompt, onData, onTelemetry, onErrorData } = options;

  // Get the response for this call
  const response = await getResponse(prompt, options);

  // Handle delay
  if (response.delay && response.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, response.delay));
  }

  // Handle error simulation
  if (response.error) {
    onErrorData?.(response.error);
    return {
      stdout: '',
      stderr: response.error,
    };
  }

  // Handle rate limit simulation
  if (response.isRateLimitError) {
    const errorMsg = `Rate limit exceeded. Retry after ${response.retryAfterSeconds ?? 60} seconds.`;
    onErrorData?.(errorMsg);
    return {
      stdout: '',
      stderr: errorMsg,
      isRateLimitError: true,
      rateLimitResetsAt: new Date(Date.now() + (response.retryAfterSeconds ?? 60) * 1000),
      retryAfterSeconds: response.retryAfterSeconds ?? 60,
    } as EngineRunResult & {
      isRateLimitError: boolean;
      rateLimitResetsAt: Date;
      retryAfterSeconds: number;
    };
  }

  // Stream the response
  await streamResponse(response, onData, globalConfig.streamDelay ?? 0);

  // Emit telemetry
  if (response.telemetry && onTelemetry) {
    onTelemetry(response.telemetry);
  }

  return {
    stdout: response.output,
    stderr: '',
  };
}
