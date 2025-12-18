/**
 * Gemini Engine
 *
 * Provides Google Gemini AI integration with direct API access.
 * Supports streaming, telemetry, and rate limit handling.
 */

import type { EngineModule } from '../../core/base.js';
import { metadata } from './metadata.js';
import * as auth from './auth.js';
import { runGemini } from './execution/index.js';

// Export all sub-modules
export * from './auth.js';
export * from './config.js';
export * from './execution/index.js';
export { metadata };

// Export as EngineModule for auto-discovery
export default {
  metadata,
  auth,
  run: runGemini,
} satisfies EngineModule;
