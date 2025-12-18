# Activity Context Branch

## Purpose
Display rich activity context in the TUI timeline showing what each agent is currently doing: goal, current file, and current action.

## Key Changes
- **Tool Call Parser**: Parse agent output to extract file operations and actions
- **Context Events**: New events for goal, currentFile, and currentAction updates
- **Timeline Display**: Show context info below agent name in timeline
- **Real-Time Updates**: Context updates as agent runs tools

## Files Created/Modified

### New Files
- `src/agents/runner/parser.ts` - Tool call parser with:
  - `parseToolUse()` - Extract tool name and parameters from XML/JSON
  - `extractContextFromTool()` - Derive context from tool parameters
  - Support for both Anthropic XML and OpenAI JSON formats

### Modified Files

#### State Types
- `src/cli/tui/routes/workflow/state/types.ts` - Added `goal`, `currentFile`, `currentAction` to AgentState

#### Events
- `src/workflows/events/types.ts` - Added event types:
  - `agent:goal`
  - `agent:current-file`
  - `agent:current-action`
- `src/workflows/events/emitter.ts` - Added emitter methods:
  - `setAgentGoal()`
  - `setCurrentFile()`
  - `setCurrentAction()`

#### UI State
- `src/cli/tui/routes/workflow/context/ui-state/types.ts` - Added action types
- `src/cli/tui/routes/workflow/context/ui-state/actions/agent-actions.ts` - Implemented:
  - `updateAgentGoal()`
  - `updateAgentCurrentFile()`
  - `updateAgentCurrentAction()`

#### Adapter
- `src/cli/tui/routes/workflow/adapters/opentui.ts` - Handle new context events

#### UI Component
- `src/cli/tui/routes/workflow/components/timeline/main-agent-node.tsx` - Display context info

#### Agent Runner
- `src/agents/runner/runner.ts` - Integrate parser to emit context updates

## Display Format

```
● AGENT-NAME (engine) • 5.2s
  Goal: Implement authentication | File: auth.ts | Action: Writing file
```

- **Goal**: Truncated if too long
- **File**: Shows basename only if width constrained
- **Action**: Current tool operation

## Parsed Tools

The parser extracts context from these tools:
- `Read` → currentFile
- `Write` → currentFile + "Writing {file}"
- `Edit` → currentFile + "Editing {file}"
- `Bash` → action from description parameter
- `Glob` / `Grep` → "Searching files"

## Test Status
- All tests passing
- Parser handles both XML formats (with and without `antml:` prefix)

## Dependencies
- None - can be merged independently

## Merge Order
Can be merged at any time. Provides foundation for richer UI feedback.
