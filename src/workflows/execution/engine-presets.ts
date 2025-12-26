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
 * Agent complexity tier (1=complex, 2=standard, 3=simple)
 */
export type AgentTier = 1 | 2 | 3;

/**
 * Agent tier assignments based on complexity
 */
const AGENT_TIERS: Record<string, AgentTier> = {
  // Tier 1: Complex reasoning - strategic planning, architecture
  'principal-analyst': 1,
  'blueprint-orchestrator': 1,
  'plan-agent': 1,
  'founder-architect': 1,
  'structural-data-architect': 1,
  'behavior-architect': 1,
  'ui-ux-architect': 1,
  'operational-architect': 1,
  // Tier 2: Standard tasks - development work
  'context-manager': 2,
  'code-generation': 2,
  'runtime-prep': 2,
  'task-breakdown': 2,
  // Tier 3: Simple tasks - quick checks, commits
  'git-commit': 3,
  'task-sanity-check': 3,
  'check-task': 3,
  'file-assembler': 3,
};

/** Default tier for unknown agents */
const DEFAULT_TIER: AgentTier = 2;

/**
 * Get the tier for an agent
 */
export function getAgentTier(agentId: string): AgentTier {
  return AGENT_TIERS[agentId] ?? DEFAULT_TIER;
}

/**
 * Engine preset configuration
 */
export interface EnginePresetConfig {
  /** Default engine for all agents */
  defaultEngine?: string;
  /** Model to use per agent tier (1=complex, 2=standard, 3=simple) */
  modelByTier?: Record<AgentTier, string>;
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
  /** Whether to enable fallback to other engines on rate limit (default: true) */
  fallbackEnabled?: boolean;
}

/**
 * Built-in preset definitions with tiered model assignments
 */
const BUILT_IN_PRESETS: Record<BuiltInPreset, EnginePresetConfig> = {
  'all-claude': {
    defaultEngine: 'claude',
    modelByTier: {
      1: 'opus',     // Complex: strategic planning, architecture
      2: 'sonnet',   // Standard: development tasks
      3: 'haiku',    // Simple: quick checks, commits
    },
  },
  'all-gemini': {
    defaultEngine: 'gemini',
    modelByTier: {
      1: 'gemini-1.5-pro',
      2: 'gemini-1.5-pro',
      3: 'gemini-1.5-flash',
    },
  },
  'all-codex': {
    defaultEngine: 'codex',
    modelByTier: {
      1: 'gpt-4o',
      2: 'gpt-4o',
      3: 'gpt-4o-mini',
    },
  },
  'all-cursor': {
    defaultEngine: 'cursor',
    modelByTier: {
      1: 'claude-3.5-sonnet',
      2: 'claude-3.5-sonnet',
      3: 'claude-3.5-sonnet',
    },
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
  /** Whether to enable fallback to other engines on rate limit (default: true) */
  fallbackEnabled?: boolean;
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
  return registry.has(engineId);
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
 * Result of resolving engine and model for an agent
 */
export interface EngineModelResolution {
  engine: string;
  model: string;
}

/**
 * Resolve engine AND model for a specific agent based on preset and tier
 *
 * This function considers the agent's complexity tier when selecting the model,
 * using more capable models for complex agents and lighter models for simple tasks.
 */
export function resolveEngineAndModelForAgent(
  agentId: string,
  context: EngineSelectionContext | null,
  configFile: EngineConfigFile | null
): EngineModelResolution | undefined {
  // Get the preset name from context or config
  const presetName = context?.preset ?? configFile?.preset;
  if (!presetName && !context?.globalEngine) {
    return undefined;
  }

  // If global engine override, use it with tier-based model
  if (context?.globalEngine) {
    const tier = getAgentTier(agentId);
    // For global engine override without preset, we need to find a matching preset
    // to get model mappings, or return just the engine
    const matchingPreset = Object.entries(BUILT_IN_PRESETS).find(
      ([, config]) => config.defaultEngine === context.globalEngine
    );
    if (matchingPreset) {
      const [, presetConfig] = matchingPreset;
      const model = presetConfig.modelByTier?.[tier];
      if (model) {
        debug('[EnginePresets] Agent %s (tier %d): engine=%s, model=%s (global override)',
          agentId, tier, context.globalEngine, model);
        return { engine: context.globalEngine, model };
      }
    }
    debug('[EnginePresets] Agent %s: engine=%s, no model mapping (global override)',
      agentId, context.globalEngine);
    return undefined;
  }

  // Resolve preset config
  const presetConfig = resolvePresetConfig(presetName!, configFile);
  if (!presetConfig?.defaultEngine) {
    return undefined;
  }

  // Get agent tier and resolve model
  const tier = getAgentTier(agentId);
  const model = presetConfig.modelByTier?.[tier];

  if (!model) {
    debug('[EnginePresets] Agent %s (tier %d): engine=%s, no model mapping',
      agentId, tier, presetConfig.defaultEngine);
    return undefined;
  }

  debug('[EnginePresets] Agent %s (tier %d): engine=%s, model=%s',
    agentId, tier, presetConfig.defaultEngine, model);

  return {
    engine: presetConfig.defaultEngine,
    model,
  };
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

/**
 * Check if fallback is enabled based on context and config
 *
 * Priority order (highest to lowest):
 * 1. Runtime context (set via TUI or CLI)
 * 2. Config file setting
 * 3. Default (true - fallback enabled)
 */
export function isFallbackEnabled(
  context: EngineSelectionContext | null,
  configFile: EngineConfigFile | null
): boolean {
  // Runtime context takes precedence
  if (context?.fallbackEnabled !== undefined) {
    return context.fallbackEnabled;
  }

  // Config file setting
  if (configFile?.fallbackEnabled !== undefined) {
    return configFile.fallbackEnabled;
  }

  // Default: fallback is enabled
  return true;
}

/**
 * Get current fallback enabled status from module-level context
 */
export function getCurrentFallbackEnabled(): boolean {
  return isFallbackEnabled(currentSelectionContext, null);
}
