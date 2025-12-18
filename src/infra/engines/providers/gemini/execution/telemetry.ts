/**
 * Gemini Telemetry
 *
 * Token counting and cost calculation for Gemini API usage.
 */

import type { ParsedTelemetry } from '../../../core/types.js';
import type { GeminiUsageMetadata } from './api-client.js';
import { calculateCost } from '../config.js';

/**
 * Convert Gemini usage metadata to parsed telemetry format
 */
export function toTelemetry(
  usage: GeminiUsageMetadata,
  model: string,
  durationMs?: number
): ParsedTelemetry {
  const tokensIn = usage.promptTokenCount;
  const tokensOut = usage.candidatesTokenCount;
  const cost = calculateCost(model, tokensIn, tokensOut);

  return {
    tokensIn,
    tokensOut,
    cost,
    duration: durationMs,
  };
}

/**
 * Format telemetry as a display string (matching Claude/Codex format)
 */
export function formatTelemetry(telemetry: ParsedTelemetry): string {
  const parts: string[] = [];

  if (telemetry.tokensIn !== undefined) {
    parts.push(`tokens_in=${telemetry.tokensIn}`);
  }
  if (telemetry.tokensOut !== undefined) {
    parts.push(`tokens_out=${telemetry.tokensOut}`);
  }
  if (telemetry.cost !== undefined) {
    parts.push(`cost=$${telemetry.cost.toFixed(4)}`);
  }
  if (telemetry.duration !== undefined) {
    parts.push(`duration=${(telemetry.duration / 1000).toFixed(1)}s`);
  }

  return parts.join(' ');
}
