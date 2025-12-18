import type { EngineMetadata } from '../../core/base.js';

export const metadata: EngineMetadata = {
  id: 'mock',
  name: 'Mock Engine',
  description: 'Mock engine for testing - returns scriptable responses',
  cliCommand: 'mock',
  cliBinary: '',
  installCommand: '',
  defaultModel: 'mock-model',
  order: 99, // Last in priority
  experimental: true,
};
