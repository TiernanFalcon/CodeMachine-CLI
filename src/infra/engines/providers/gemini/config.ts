import * as path from 'node:path';
import { homedir } from 'node:os';

import { expandHomeDir } from '../../../../shared/utils/index.js';

export interface GeminiConfigOptions {
  configDir?: string;
}

/**
 * Resolves the Gemini config directory
 */
export function resolveGeminiConfigDir(options?: GeminiConfigOptions): string {
  if (options?.configDir) {
    return expandHomeDir(options.configDir);
  }

  if (process.env.GEMINI_CONFIG_DIR) {
    return expandHomeDir(process.env.GEMINI_CONFIG_DIR);
  }

  // Default config location
  return path.join(homedir(), '.codemachine', 'gemini');
}

/**
 * Gets the path to the API key file
 */
export function getApiKeyPath(configDir: string): string {
  return path.join(configDir, 'api-key.json');
}

/**
 * Model pricing (USD per 1M tokens) - as of Jan 2025
 * See: https://ai.google.dev/pricing
 */
export const GEMINI_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Gemini 2.0 Flash Thinking (experimental)
  'gemini-2.0-flash-thinking-exp-01-21': { inputPer1M: 0, outputPer1M: 0 }, // Free during experimental
  'gemini-2.0-flash-thinking-exp': { inputPer1M: 0, outputPer1M: 0 },

  // Gemini 2.0 Flash
  'gemini-2.0-flash-exp': { inputPer1M: 0, outputPer1M: 0 }, // Free during experimental
  'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },

  // Gemini 1.5 Pro
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.00 },
  'gemini-1.5-pro-latest': { inputPer1M: 1.25, outputPer1M: 5.00 },

  // Gemini 1.5 Flash
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'gemini-1.5-flash-latest': { inputPer1M: 0.075, outputPer1M: 0.30 },

  // Default fallback pricing
  'default': { inputPer1M: 0.50, outputPer1M: 1.50 },
};

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): { inputPer1M: number; outputPer1M: number } {
  return GEMINI_PRICING[model] ?? GEMINI_PRICING['default'];
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}
