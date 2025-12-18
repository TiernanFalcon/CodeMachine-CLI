/**
 * Engine Selection Presets
 *
 * Provides preset configurations for engine selection, allowing users
 * to quickly configure which AI engine(s) to use for all agents.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debug } from '../../shared/logging/logger.js';
import { registry } from '../../infra/engines/index.js';

/**
 * Built-in preset names
 */
export type BuiltInPreset = 'all-claude' | 'all-gemini' | 'all-codex' | 'all-cursor';

/**
 * Engine preset configuration
 */
export interface EnginePresetConfig {
  /** Default engine for all agents */
  defaultEngine?: string;
  /** Per-agent engine overrides (agentId -> engineId) */
  agentOverrides?: Record<string, string>;
}

/**
 * Engine configuration file format (.codemachine/engine-config.json)
 */
export interface EngineConfigFile {
  /** Active preset name (built-in or custom) */
  preset?: string;
  /** Custom presets */
  presets?: Record<string, EnginePresetConfig>;
  /** Direct per-agent overrides (merged with preset) */
  overrides?: Record<string, string>;
}

/**
 * Built-in preset definitions
 */
const BUILT_IN_PRESETS: Record<BuiltInPreset, EnginePresetConfig> = {
  'all-claude': {
    defaultEngine: 'claude',
  },
  'all-gemini': {
    defaultEngine: 'gemini',
  },
  'all-codex': {
    defaultEngine: 'codex',
  },
  'all-cursor': {
    defaultEngine: 'cursor',
  },
};

/**
 * Runtime engine selection context
 * Passed through workflow execution to override engine selection
 */
export interface EngineSelectionContext {
  /** Preset to apply (built-in name or custom) */
  preset?: string;
  /** Direct engine override for all agents */
  globalEngine?: string;
  /** Per-agent overrides */
  agentOverrides?: Record<string, string>;
}

// Module-level selection context (set at workflow start)
let currentSelectionContext: EngineSelectionContext | null = null;

/**
 * Set the engine selection context for the current workflow
 */
export function setEngineSelectionContext(context: EngineSelectionContext | null): void {
  currentSelectionContext = context;
  if (context) {
    debug('[EnginePresets] Selection context set: preset=%s, globalEngine=%s, overrides=%d',
      context.preset ?? 'none',
      context.globalEngine ?? 'none',
      Object.keys(context.agentOverrides ?? {}).length
    );
  } else {
    debug('[EnginePresets] Selection context cleared');
  }
}

/**
 * Get the current engine selection context
 */
export function getEngineSelectionContext(): EngineSelectionContext | null {
  return currentSelectionContext;
}

/**
 * Clear the engine selection context
 */
export function clearEngineSelectionContext(): void {
  currentSelectionContext = null;
}

/**
 * Check if a preset name is a built-in preset
 */
export function isBuiltInPreset(name: string): name is BuiltInPreset {
  return name in BUILT_IN_PRESETS;
}

/**
 * Get a built-in preset configuration
 */
export function getBuiltInPreset(name: BuiltInPreset): EnginePresetConfig {
  return BUILT_IN_PRESETS[name];
}

/**
 * Get all available built-in preset names
 */
export function getBuiltInPresetNames(): BuiltInPreset[] {
  return Object.keys(BUILT_IN_PRESETS) as BuiltInPreset[];
}

/**
 * Get all available engine IDs for validation
 */
export function getAvailableEngineIds(): string[] {
  return registry.getAllIds();
}

/**
 * Validate that an engine ID exists in the registry
 */
export function isValidEngineId(engineId: string): boolean {
  return registry.get(engineId) !== undefined;
}

/**
 * Load engine configuration from .codemachine/engine-config.json
 */
export async function loadEngineConfig(cmRoot: string): Promise<EngineConfigFile | null> {
  const configPath = path.join(cmRoot, 'engine-config.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config: EngineConfigFile = JSON.parse(content);
    debug('[EnginePresets] Loaded config from %s', configPath);
    return config;
  } catch (_error) {
    // File doesn't exist or is invalid
    debug('[EnginePresets] No engine config found at %s', configPath);
    return null;
  }
}

/**
 * Save engine configuration to .codemachine/engine-config.json
 */
export async function saveEngineConfig(cmRoot: string, config: EngineConfigFile): Promise<void> {
  const configPath = path.join(cmRoot, 'engine-config.json');

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  debug('[EnginePresets] Saved config to %s', configPath);
}

/**
 * Resolve engine for a specific agent based on current context and config
 *
 * Priority order (highest to lowest):
 * 1. CLI --engine flag (globalEngine in context)
 * 2. CLI --preset flag (preset in context)
 * 3. Per-agent override from context
 * 4. Config file preset
 * 5. Config file per-agent override
 * 6. Step-level engine specification (handled externally)
 * 7. Default engine selection (handled externally)
 */
export function resolveEngineForAgent(
  agentId: string,
  context: EngineSelectionContext | null,
  configFile: EngineConfigFile | null
): string | undefined {
  // 1. CLI --engine flag overrides everything
  if (context?.globalEngine) {
    debug('[EnginePresets] Agent %s: using global engine override %s', agentId, context.globalEngine);
    return context.globalEngine;
  }

  // 2. CLI --preset flag
  if (context?.preset) {
    const presetConfig = resolvePresetConfig(context.preset, configFile);
    if (presetConfig?.defaultEngine) {
      debug('[EnginePresets] Agent %s: using preset %s -> %s', agentId, context.preset, presetConfig.defaultEngine);
      return presetConfig.defaultEngine;
    }
    // Check for agent-specific override in preset
    if (presetConfig?.agentOverrides?.[agentId]) {
      debug('[EnginePresets] Agent %s: using preset agent override -> %s', agentId, presetConfig.agentOverrides[agentId]);
      return presetConfig.agentOverrides[agentId];
    }
  }

  // 3. Per-agent override from context
  if (context?.agentOverrides?.[agentId]) {
    debug('[EnginePresets] Agent %s: using context agent override -> %s', agentId, context.agentOverrides[agentId]);
    return context.agentOverrides[agentId];
  }

  // 4. Config file preset (if no CLI preset specified)
  if (!context?.preset && configFile?.preset) {
    const presetConfig = resolvePresetConfig(configFile.preset, configFile);
    if (presetConfig?.defaultEngine) {
      debug('[EnginePresets] Agent %s: using config preset %s -> %s', agentId, configFile.preset, presetConfig.defaultEngine);
      return presetConfig.defaultEngine;
    }
    if (presetConfig?.agentOverrides?.[agentId]) {
      debug('[EnginePresets] Agent %s: using config preset agent override -> %s', agentId, presetConfig.agentOverrides[agentId]);
      return presetConfig.agentOverrides[agentId];
    }
  }

  // 5. Config file per-agent override
  if (configFile?.overrides?.[agentId]) {
    debug('[EnginePresets] Agent %s: using config agent override -> %s', agentId, configFile.overrides[agentId]);
    return configFile.overrides[agentId];
  }

  // No override found - let the caller handle default selection
  debug('[EnginePresets] Agent %s: no override found', agentId);
  return undefined;
}

/**
 * Resolve a preset configuration by name
 */
function resolvePresetConfig(
  presetName: string,
  configFile: EngineConfigFile | null
): EnginePresetConfig | undefined {
  // Check built-in presets first
  if (isBuiltInPreset(presetName)) {
    return getBuiltInPreset(presetName);
  }

  // Check custom presets in config file
  if (configFile?.presets?.[presetName]) {
    return configFile.presets[presetName];
  }

  debug('[EnginePresets] Unknown preset: %s', presetName);
  return undefined;
}

/**
 * Get a human-readable description of available presets
 */
export function describeAvailablePresets(configFile: EngineConfigFile | null): string {
  const lines: string[] = ['Available presets:'];

  // Built-in presets
  lines.push('  Built-in:');
  for (const [name, config] of Object.entries(BUILT_IN_PRESETS)) {
    lines.push(`    ${name}: Use ${config.defaultEngine} for all agents`);
  }

  // Custom presets from config
  if (configFile?.presets && Object.keys(configFile.presets).length > 0) {
    lines.push('  Custom:');
    for (const [name, config] of Object.entries(configFile.presets)) {
      const desc = config.defaultEngine
        ? `Use ${config.defaultEngine} for all agents`
        : `Custom agent mappings`;
      lines.push(`    ${name}: ${desc}`);
    }
  }

  return lines.join('\n');
}
