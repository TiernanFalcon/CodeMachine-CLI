/**
 * Gemini Engine Runner
 *
 * Main execution logic for Google Gemini AI.
 * Handles streaming, telemetry, and rate limit detection.
 */

import type { EngineRunOptions, EngineRunResult } from '../../../core/types.js';
import { getApiKey } from '../auth.js';
import { metadata } from '../metadata.js';
import { streamGenerateContent, type GeminiUsageMetadata } from './api-client.js';
import { toTelemetry, formatTelemetry } from './telemetry.js';

export interface RunGeminiResult extends EngineRunResult {
  isRateLimitError?: boolean;
  rateLimitResetsAt?: Date;
  retryAfterSeconds?: number;
}

/**
 * Run Gemini with the given prompt
 */
export async function runGemini(options: EngineRunOptions): Promise<RunGeminiResult> {
  const {
    prompt,
    model,
    onData,
    onErrorData,
    onTelemetry,
    abortSignal,
  } = options;

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    const errorMsg = `${metadata.name} is not authenticated. Run 'codemachine auth login' to authenticate.`;
    onErrorData?.(errorMsg);
    return {
      stdout: '',
      stderr: errorMsg,
    };
  }

  // Use provided model or default
  const modelId = model ?? metadata.defaultModel ?? 'gemini-2.0-flash-thinking-exp-01-21';

  const startTime = Date.now();
  let lastUsage: GeminiUsageMetadata | undefined;
  let fullOutput = '';

  try {
    const result = await streamGenerateContent({
      apiKey,
      model: modelId,
      prompt,
      onChunk: (text) => {
        fullOutput += text;
        onData?.(text);
      },
      onUsage: (usage) => {
        lastUsage = usage;

        // Emit telemetry update
        if (onTelemetry) {
          const durationMs = Date.now() - startTime;
          const telemetry = toTelemetry(usage, modelId, durationMs);
          onTelemetry(telemetry);
        }
      },
      abortSignal,
    });

    // Check for rate limit error
    if (result.isRateLimitError) {
      const retryAfterSeconds = result.retryAfterSeconds ?? 60;
      const rateLimitResetsAt = new Date(Date.now() + retryAfterSeconds * 1000);

      onErrorData?.(`Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);

      return {
        stdout: '',
        stderr: `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
        isRateLimitError: true,
        rateLimitResetsAt,
        retryAfterSeconds,
      };
    }

    // Final telemetry
    if (result.usage && onTelemetry) {
      const durationMs = Date.now() - startTime;
      const telemetry = toTelemetry(result.usage, modelId, durationMs);
      onTelemetry(telemetry);

      // Log telemetry line for parsing
      const telemetryLine = `\n[TELEMETRY] ${formatTelemetry(telemetry)}`;
      onData?.(telemetryLine);
    }

    return {
      stdout: result.output,
      stderr: '',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error indicates rate limit
    if (
      errorMessage.includes('429') ||
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('rate limit')
    ) {
      const retryAfterSeconds = 60; // Default retry
      const rateLimitResetsAt = new Date(Date.now() + retryAfterSeconds * 1000);

      onErrorData?.(`Rate limit exceeded: ${errorMessage}`);

      return {
        stdout: fullOutput,
        stderr: errorMessage,
        isRateLimitError: true,
        rateLimitResetsAt,
        retryAfterSeconds,
      };
    }

    onErrorData?.(errorMessage);

    return {
      stdout: fullOutput,
      stderr: errorMessage,
    };
  }
}
