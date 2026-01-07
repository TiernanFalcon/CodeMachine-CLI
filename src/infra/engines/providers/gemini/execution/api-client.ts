/**
 * Gemini API Client
 *
 * Direct integration with Google's Generative AI API using native fetch.
 * Supports streaming responses for real-time output.
 */

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface GeminiRequest {
  contents: GeminiMessage[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
      role?: string;
    };
    finishReason?: string;
    index?: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

export interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

/**
 * Check if response is a rate limit error
 */
export function isRateLimitError(error: GeminiErrorResponse): boolean {
  const code = error.error?.code;
  const status = error.error?.status;
  const message = error.error?.message?.toLowerCase() ?? '';

  return (
    code === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

/**
 * Parse retry-after from error response
 */
export function parseRetryAfter(error: GeminiErrorResponse): number | undefined {
  // Check details for retry info
  const details = error.error?.details;
  if (details) {
    for (const detail of details) {
      if (detail.metadata?.['retryDelay']) {
        const delay = detail.metadata['retryDelay'];
        // Parse "60s" format
        const match = delay.match(/(\d+)s/);
        if (match) {
          return Number.parseInt(match[1], 10);
        }
      }
    }
  }

  // Default retry delay for rate limits
  return 60;
}

export interface StreamGenerateOptions {
  apiKey: string;
  model: string;
  prompt: string;
  onChunk: (text: string) => void;
  onUsage?: (usage: GeminiUsageMetadata) => void;
  abortSignal?: AbortSignal;
}

/**
 * Stream generate content from Gemini API
 */
export async function streamGenerateContent(
  options: StreamGenerateOptions
): Promise<{
  output: string;
  usage?: GeminiUsageMetadata;
  isRateLimitError?: boolean;
  retryAfterSeconds?: number;
}> {
  const { apiKey, model, prompt, onChunk, onUsage, abortSignal } = options;

  // Use URL without API key - key is passed via header for security
  // This prevents API key exposure in logs, browser history, and referrer headers
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const request: GeminiRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 65536, // Large context for code generation
    },
    // Disable safety filters for code generation
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(request),
    signal: abortSignal,
  });

  // Handle error responses
  if (!response.ok) {
    const errorBody = await response.text();
    let errorData: GeminiErrorResponse;

    try {
      errorData = JSON.parse(errorBody);
    } catch {
      errorData = {
        error: {
          code: response.status,
          message: errorBody,
          status: response.statusText,
        },
      };
    }

    if (isRateLimitError(errorData)) {
      return {
        output: '',
        isRateLimitError: true,
        retryAfterSeconds: parseRetryAfter(errorData),
      };
    }

    throw new Error(`Gemini API error: ${errorData.error?.message ?? response.statusText}`);
  }

  // Process streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullOutput = '';
  let lastUsage: GeminiUsageMetadata | undefined;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk: GeminiStreamChunk = JSON.parse(jsonStr);

            // Extract text from candidates
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullOutput += text;
              onChunk(text);
            }

            // Track usage metadata
            if (chunk.usageMetadata) {
              lastUsage = chunk.usageMetadata;
              onUsage?.(chunk.usageMetadata);
            }
          } catch {
            // Ignore parse errors for incomplete JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    output: fullOutput,
    usage: lastUsage,
  };
}
