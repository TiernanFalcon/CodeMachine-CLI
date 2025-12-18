import type { EngineMetadata } from '../../core/base.js';

export const metadata: EngineMetadata = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini AI with advanced reasoning capabilities',
  cliCommand: 'gemini',
  cliBinary: '', // No external binary - uses direct API
  installCommand: '', // No install needed - uses @google/generative-ai
  defaultModel: 'gemini-2.0-flash-thinking-exp-01-21',
  order: 1, // High priority - excellent for code generation
  experimental: false,
};
