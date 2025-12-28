/**
 * Engine Registry - Auto-discovers and manages engine plugins
 *
 * Uses lazy loading to improve startup time - engines are only
 * fully loaded when actually accessed.
 */

import type { EngineModule, EngineMetadata } from './base.js';
import { isEngineModule } from './base.js';

/**
 * Engine loader function - returns a promise that resolves to an engine module
 */
type EngineLoader = () => Promise<EngineModule>;

/**
 * Lazy engine entry - stores loader and cached module
 */
interface LazyEngine {
  metadata: EngineMetadata;
  loader: EngineLoader;
  module?: EngineModule;
  loading?: Promise<EngineModule>;
}

/**
 * Engine metadata for lazy registration
 * Allows showing engine info without loading the full module
 * Note: supportsResume indicates if engine can continue from a previous session
 */
const ENGINE_METADATA: EngineMetadata[] = [
  { id: 'gemini', name: 'Gemini', order: 1, defaultModel: 'gemini-2.0-flash', supportsResume: false },
  { id: 'codex', name: 'Codex', order: 2, defaultModel: 'codex', supportsResume: true },
  { id: 'claude', name: 'Claude', order: 3, defaultModel: 'claude-sonnet-4-20250514', supportsResume: false },
  { id: 'cursor', name: 'Cursor', order: 4, defaultModel: 'claude-sonnet', supportsResume: false },
  { id: 'ccr', name: 'Claude Code Runner', order: 5, defaultModel: 'claude-sonnet-4-20250514', supportsResume: false },
  { id: 'opencode', name: 'OpenCode', order: 6, defaultModel: 'anthropic/claude-sonnet-4-20250514', supportsResume: true },
  { id: 'auggie', name: 'Auggie', order: 7, defaultModel: 'anthropic/claude-sonnet-4-20250514', supportsResume: false },
];

/**
 * Dynamic import loaders for each engine
 * These are only called when the engine is actually needed
 */
const ENGINE_LOADERS: Record<string, EngineLoader> = {
  gemini: async () => (await import('../providers/gemini/index.js')).default,
  codex: async () => (await import('../providers/codex/index.js')).default,
  claude: async () => (await import('../providers/claude/index.js')).default,
  cursor: async () => (await import('../providers/cursor/index.js')).default,
  ccr: async () => (await import('../providers/ccr/index.js')).default,
  opencode: async () => (await import('../providers/opencode/index.js')).default,
  auggie: async () => (await import('../providers/auggie/index.js')).default,
  mock: async () => (await import('../providers/mock/index.js')).default,
};

/**
 * Engine Registry - Singleton that manages all available engines
 * Uses lazy loading for improved startup performance
 */
class EngineRegistry {
  private engines = new Map<string, LazyEngine>();
  private initialized = false;

  /**
   * Initialize registry with lazy engine entries
   * Does NOT load engine modules - just registers metadata
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Register all engines with their metadata and loaders
    for (const metadata of ENGINE_METADATA) {
      const loader = ENGINE_LOADERS[metadata.id];
      if (loader) {
        this.engines.set(metadata.id, { metadata, loader });
      }
    }

    // Mock engine only in test mode
    if (process.env.CODEMACHINE_ENABLE_MOCK_ENGINE === '1') {
      const mockLoader = ENGINE_LOADERS['mock'];
      if (mockLoader) {
        this.engines.set('mock', {
          metadata: { id: 'mock', name: 'Mock', order: 99 },
          loader: mockLoader,
        });
      }
    }

    this.initialized = true;
  }

  /**
   * Load an engine module (lazy loading with caching)
   */
  private async loadEngine(entry: LazyEngine): Promise<EngineModule> {
    // Already loaded
    if (entry.module) {
      return entry.module;
    }

    // Currently loading - wait for it
    if (entry.loading) {
      return entry.loading;
    }

    // Start loading
    entry.loading = (async () => {
      const module = await entry.loader();

      if (!isEngineModule(module)) {
        throw new Error(`Invalid engine module for ${entry.metadata.id}`);
      }

      // Update metadata from actual module (in case it differs)
      entry.metadata = module.metadata;
      entry.module = module;

      // Call onRegister hook
      module.onRegister?.();

      return module;
    })();

    try {
      return await entry.loading;
    } finally {
      entry.loading = undefined;
    }
  }

  /**
   * Manually register an engine (for testing or dynamic registration)
   */
  register(engine: EngineModule): void {
    const id = engine.metadata.id;

    if (this.engines.has(id)) {
      console.warn(`Engine "${id}" is already registered. Skipping.`);
      return;
    }

    this.engines.set(id, {
      metadata: engine.metadata,
      loader: async () => engine,
      module: engine,
    });

    engine.onRegister?.();
  }

  /**
   * Get an engine by ID (loads if not already loaded)
   */
  get(id: string): EngineModule | undefined {
    const entry = this.engines.get(id);
    if (!entry) {
      return undefined;
    }

    // If already loaded, return immediately
    if (entry.module) {
      return entry.module;
    }

    // For sync access, we can't load - return undefined
    // Caller should use getAsync() for lazy loading
    return undefined;
  }

  /**
   * Get an engine by ID with async loading
   */
  async getAsync(id: string): Promise<EngineModule | undefined> {
    const entry = this.engines.get(id);
    if (!entry) {
      return undefined;
    }

    return this.loadEngine(entry);
  }

  /**
   * Get all registered engines (loads all - use sparingly)
   */
  getAll(): EngineModule[] {
    const loaded: EngineModule[] = [];

    for (const entry of this.engines.values()) {
      if (entry.module) {
        loaded.push(entry.module);
      }
    }

    return loaded.sort((a, b) => (a.metadata.order ?? 99) - (b.metadata.order ?? 99));
  }

  /**
   * Get all engines with async loading
   */
  async getAllAsync(): Promise<EngineModule[]> {
    const engines = await Promise.all(
      Array.from(this.engines.values()).map((entry) => this.loadEngine(entry))
    );

    return engines.sort((a, b) => (a.metadata.order ?? 99) - (b.metadata.order ?? 99));
  }

  /**
   * Get all engine IDs (no loading required)
   */
  getAllIds(): string[] {
    return Array.from(this.engines.keys());
  }

  /**
   * Get all engine metadata (no loading required)
   */
  getAllMetadata(): EngineMetadata[] {
    return Array.from(this.engines.values())
      .map((entry) => entry.metadata)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  /**
   * Check if an engine is registered (no loading required)
   */
  has(id: string): boolean {
    return this.engines.has(id);
  }

  /**
   * Get the default engine (first by order, with loading)
   */
  getDefault(): EngineModule | undefined {
    const sorted = Array.from(this.engines.values())
      .sort((a, b) => (a.metadata.order ?? 99) - (b.metadata.order ?? 99));

    for (const entry of sorted) {
      if (entry.module) {
        return entry.module;
      }
    }

    return undefined;
  }

  /**
   * Get the default engine with async loading
   */
  async getDefaultAsync(): Promise<EngineModule | undefined> {
    const sorted = Array.from(this.engines.values())
      .sort((a, b) => (a.metadata.order ?? 99) - (b.metadata.order ?? 99));

    if (sorted.length === 0) {
      return undefined;
    }

    return this.loadEngine(sorted[0]);
  }

  /**
   * Clear all engines (mainly for testing)
   */
  clear(): void {
    this.engines.clear();
    this.initialized = false;
  }

  /**
   * Check if an engine is loaded (not just registered)
   */
  isLoaded(id: string): boolean {
    const entry = this.engines.get(id);
    return entry?.module !== undefined;
  }

  /**
   * Check if an engine supports session resume (no loading required)
   */
  supportsResume(id: string): boolean {
    const entry = this.engines.get(id);
    return entry?.metadata.supportsResume === true;
  }

  /**
   * Get IDs of all engines that support resume (no loading required)
   */
  getResumableEngineIds(): string[] {
    return Array.from(this.engines.entries())
      .filter(([_, entry]) => entry.metadata.supportsResume === true)
      .map(([id]) => id);
  }
}

// Export singleton instance
export const registry = new EngineRegistry();

// Initialize on module load (fast - just registers metadata)
await registry.initialize();
