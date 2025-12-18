/**
 * Mock Engine
 *
 * Provides scriptable, deterministic responses for testing.
 * Only registered when CODEMACHINE_ENABLE_MOCK_ENGINE=1.
 */

import type { EngineModule } from '../../core/base.js';
import { metadata } from './metadata.js';
import * as auth from './auth.js';
import { runMock } from './execution/index.js';

// Export all sub-modules
export * from './auth.js';
export * from './execution/index.js';
export { metadata };

// Export as EngineModule for auto-discovery
export default {
  metadata,
  auth,
  run: runMock,
} satisfies EngineModule;
