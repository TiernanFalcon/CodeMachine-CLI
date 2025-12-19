# Engine Selection Presets Branch

## Purpose
Allow users to select which AI engine to use for all agents via CLI flags and configuration files, with preset configurations like "all-claude" or "all-gemini".

## Key Changes
- CLI flags `--engine` and `--preset` for the `start` command
- Built-in presets: all-claude, all-gemini, all-codex, all-cursor
- Config file support for persistent engine preferences
- Per-agent engine overrides in config file
- Priority-based engine resolution system

## Files Created
- `src/workflows/execution/engine-presets.ts` - Preset definitions, config loading, resolution logic

## Files Modified
- `src/cli/commands/start.command.ts` - Added CLI flags
- `src/workflows/execution/engine.ts` - Integrated preset context into selectEngine
- `src/workflows/execution/run.ts` - Set up context at workflow start
- `src/workflows/templates/types.ts` - Extended RunWorkflowOptions

## Usage Examples
```bash
# Use Claude for all agents
codemachine start --engine claude

# Use a preset
codemachine start --preset all-gemini
```

## Config File Format (.codemachine/engine-config.json)
```json
{
  "preset": "all-claude",
  "overrides": {
    "code-generation": "codex"
  }
}
```

## Priority Order (highest to lowest)
1. CLI `--engine` flag
2. CLI `--preset` flag
3. Step-level engine override (workflow template)
4. Config file preset
5. Config file per-agent override
6. First authenticated engine

## Test Status
TypeScript and ESLint pass

## Dependencies
None - can be merged independently
