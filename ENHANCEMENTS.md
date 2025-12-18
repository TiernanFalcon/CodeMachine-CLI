# CodeMachine Enhancement Proposal

> **Status**: Proposal - Awaiting team review
> **Created**: 2025-12-18
> **Author**: Tiernan

## How to Contribute These Enhancements

According to [contributing.md](contributing.md), these enhancements involve **UI and Features** which require team review first. Here's the recommended contribution workflow:

### Step 1: Team Review
1. Open an issue for each enhancement (or one umbrella issue linking to this document)
2. Wait for approval from the core dev team before starting work
3. Discuss any architectural concerns or design decisions

### Step 2: Submit Focused PRs
Each enhancement should be submitted as a **separate, focused PR**:

1. **PR #1: Summary Generator** (easiest, no UI changes)
   - New files in `src/workflows/execution/`
   - Low risk, high value

2. **PR #2: Rich Activity Context** (TUI changes - requires approval)
   - Modifications to TUI components and event system
   - **Requires team review** (UI feature)

3. **PR #3: Rate Limit Handling** (engine infrastructure)
   - New rate limit manager and fallback logic
   - Updates to existing engine runners

4. **PR #4: Gemini Integration** (new engine provider)
   - New engine provider directory
   - Builds on rate limit handling from PR #3

### Step 3: Pre-submission Checklist
Before submitting each PR, run:
```bash
bun run lint
bun run typecheck
bun test
```

### Dependency Order
- PRs #1-2 are independent
- PR #3 (Rate Limit Handling) should be merged before PR #4 (Gemini)
- PR #4 enhances PR #3 with RESOURCE_EXHAUSTED detection

---

## Overview

This proposal outlines four enhancements to CodeMachine:

| Enhancement | Type | Complexity | Effort | Team Review Required |
|-------------|------|------------|--------|---------------------|
| **1. Rich Activity Context** | TUI Feature | Medium | 3-4 hours | ✅ Yes (UI) |
| **2. Proactive Rate Limit Handling** | Infrastructure | High | 4-5 hours | Maybe |
| **3. Summary Generator** | Feature | Medium | 3-4 hours | Maybe |
| **4. Gemini Integration** | AI Provider | High | 5-6 hours | ✅ Yes (new provider) |

**Total Estimated Effort**: 18-24 hours

---

## Enhancement 1: Rich Activity Context

### Goal
Display additional context in TUI beyond current `● CODE-GEN running (task 3/23)`:
```
● CODE-GEN running (task 3/23)
  Goal: Implement auth | File: auth.ts | Action: Writing auth.ts
```

### Why This Matters
- Provides real-time visibility into what agents are doing
- Helps users understand workflow progress at a granular level
- Improves debugging when workflows stall or fail

### Architecture Discovery

**TUI Framework**: OpenTUI with SolidJS (NOT Ink/React)

**Data Flow**:
```
WorkflowEventEmitter → WorkflowEventBus → OpenTUIAdapter → UIState Store → UI Components
```

### Implementation

#### Files to Modify

1. **[src/cli/tui/routes/workflow/state/types.ts](src/cli/tui/routes/workflow/state/types.ts)**
   - Extend `AgentState` interface with `goal`, `currentFile`, `currentAction`

2. **[src/workflows/events/types.ts](src/workflows/events/types.ts)**
   - Add event types: `agent:goal`, `agent:current-file`, `agent:current-action`

3. **[src/workflows/events/emitter.ts](src/workflows/events/emitter.ts)**
   - Add methods: `setAgentGoal()`, `setCurrentFile()`, `setCurrentAction()`

4. **[src/cli/tui/routes/workflow/adapters/opentui.ts](src/cli/tui/routes/workflow/adapters/opentui.ts)**
   - Handle new events in `handleEvent()`

5. **[src/cli/tui/routes/workflow/components/timeline/main-agent-node.tsx](src/cli/tui/routes/workflow/components/timeline/main-agent-node.tsx)**
   - Display goal, currentFile, currentAction in timeline node

6. **[src/agents/runner/runner.ts](src/agents/runner/runner.ts)**
   - Parse tool calls from agent output stream
   - Emit context events when tools are used

#### New File

**[src/agents/runner/parser.ts](src/agents/runner/parser.ts)** - Tool call parser

```typescript
export function parseToolUse(output: string): {
  tool?: string;
  parameters?: Record<string, any>;
}

export function extractContextFromTool(
  tool: string,
  params: Record<string, any>
): {
  currentFile?: string;
  currentAction?: string;
}
```

#### Design Decision: Tool Call Parsing

**Approach**: Parse agent tool calls automatically from output stream

**Why**:
- Non-intrusive: no agent prompt modifications needed
- Real-time: updates as tools are invoked
- Accurate: based on actual tool use, not LLM guesses

**How**:
- Monitor `Read`, `Write`, `Edit` tools → extract file_path
- Monitor `Bash` tool → extract description
- Parse goal from initial prompt or first agent message

---

## Enhancement 2: Proactive Rate Limit Handling

### Goal
Detect rate limit errors immediately (HTTP 429, Anthropic `rate_limit_error`, Google `RESOURCE_EXHAUSTED`) and:
1. Switch to fallback engine right away (not after 30min timeout)
2. Track when rate limit expires
3. Re-activate engine when cooldown period ends

### Why This Matters
- Current system waits for full timeout before trying fallback
- Wastes time and user money hitting rate limits repeatedly
- No visibility into which engines are rate-limited

### Current State

**Existing Rate Limit Detection**:
- Claude: Detects `rate_limit` at [src/infra/engines/providers/claude/execution/runner.ts:289](src/infra/engines/providers/claude/execution/runner.ts#L289)
- Codex: No detection
- Other engines: No detection

**Existing Fallback System**: `notCompletedFallback` in [src/workflows/execution/fallback.ts](src/workflows/execution/fallback.ts)
- Triggers on step failure, not rate limits
- Agent-level fallback (different agent)
- New system will be engine-level (same agent, different engine)

### Implementation

#### Files to Modify

1. **[src/infra/engines/core/types.ts](src/infra/engines/core/types.ts)**
   - Add `isRateLimitError?` and `rateLimitResetsAt?` to `EngineRunResult`

2. **[src/infra/engines/providers/claude/execution/runner.ts](src/infra/engines/providers/claude/execution/runner.ts)**
   - Enhance existing detection (line 289)
   - Return `isRateLimitError: true` in result
   - Parse retry-after header

3. **[src/infra/engines/providers/codex/execution/runner.ts](src/infra/engines/providers/codex/execution/runner.ts)**
   - Add HTTP 429 detection
   - Check error output for "rate" or "429"

4. **[src/workflows/execution/step.ts](src/workflows/execution/step.ts)**
   - Replace `engine.run()` with `runWithFallback()`

5. **[src/workflows/events/types.ts](src/workflows/events/types.ts)**
   - Add event types: `engine:rate-limited`, `engine:available`, `engine:fallback`

6. **[src/workflows/execution/fallback.ts](src/workflows/execution/fallback.ts)**
   - Document coordination between engine fallback and agent fallback

#### New Files

**[src/workflows/execution/rate-limit-manager.ts](src/workflows/execution/rate-limit-manager.ts)**
- Track rate-limited engines with reset timestamps
- `isEngineAvailable(engineId): boolean`
- Persist to `.codemachine/rate-limits.json`
- Emit events when engines become available

**[src/workflows/execution/engine-fallback.ts](src/workflows/execution/engine-fallback.ts)**
- Wrapper around `engine.run()`
- Try primary engine, fallback on rate limit
- Return result with actual engine used

**[src/workflows/execution/rate-limit-monitor.ts](src/workflows/execution/rate-limit-monitor.ts)**
- Background timer checking expiry times
- Emit `engine:available` when limits expire
- Cleanup expired entries

#### Design Decision: State Persistence

**Approach**: Persist to `.codemachine/rate-limits.json`

**Why**:
- Honors cooldowns across CLI restarts
- Prevents wasted API calls immediately after restart
- User can manually clear if needed

**Format**:
```json
{
  "claude": {
    "limitedAt": "2025-12-18T10:30:00Z",
    "resetsAt": "2025-12-18T11:00:00Z"
  }
}
```

---

## Enhancement 3: Summary Generator

### Goal
After each workflow step completes, generate a human-readable markdown summary:
- What was accomplished
- Key decisions made
- Files created/modified
- Metrics (tokens, cost, duration)

Save to `.codemachine/summaries/step-N.md`

### Why This Matters
- Provides historical record of workflow executions
- Helps understand what each agent did
- Useful for debugging and auditing
- Can be shared with team members

### Current State

**Existing Infrastructure**:
- `.codemachine/artifacts/` directory exists but unused
- `.codemachine/logs/` contains raw agent logs
- `AgentMonitorService` tracks telemetry data
- No structured summary generation

### Implementation

#### Files to Modify

1. **[src/workflows/execution/runner.ts](src/workflows/execution/runner.ts)**
   - Hook at line 352 (after step completion)
   - Call `generateStepSummary()`
   - Hook at end of workflow for workflow summary

2. **[src/runtime/services/workspace/init.ts](src/runtime/services/workspace/init.ts)**
   - Add `.codemachine/summaries/` directory creation (line 49 area)
   - Update `.gitignore` template to exclude summaries

3. **[src/agents/monitoring/monitor.ts](src/agents/monitoring/monitor.ts)**
   - Use `AgentMonitorService.getInstance()` for telemetry data

#### New File

**[src/workflows/execution/summary-generator.ts](src/workflows/execution/summary-generator.ts)**

Functions:
- `generateStepSummary(step, output, agentId, stepIndex)` → markdown
- `parseAgentOutput(output)` → extract file modifications
- `generateWorkflowSummary(steps, summaries)` → overall summary
- `saveSummary(content, path)` → write to disk

#### Summary Template

**Per-Step Summary** (`step-N.md`):
```markdown
# Step N: [Agent Name]

**Status**: Completed | Failed | Skipped
**Duration**: X.Xs
**Engine**: claude (gemini-2.0-pro)
**Cost**: $X.XX

## Goal
[Step goal/objective]

## Accomplishments
- [Key accomplishment 1]
- [Key accomplishment 2]

## Files Modified
- `path/to/file1.ts` - Created/Modified/Deleted
- `path/to/file2.ts` - Created/Modified/Deleted

## Key Decisions
- [Decision 1]
- [Decision 2]

## Metrics
- Tokens In: XXX
- Tokens Out: XXX
- Tool Calls: XX
- Thinking Blocks: XX

## Output
[Truncated agent output or link to log file]
```

**Workflow Summary** (`workflow-summary.md`):
- All steps with status
- Total cost and tokens
- Timeline
- Links to step summaries

#### Design Decision: .gitignore

**Approach**: Add `.codemachine/summaries/` to `.gitignore`

**Why**:
- Treat as ephemeral build artifacts
- Avoid merge conflicts
- Keep repo clean
- Users can opt-in to tracking if desired

---

## Enhancement 4: Gemini Integration

### Goal
Add Google Gemini as a fully integrated engine provider, on par with Claude and Codex.

### Why This Matters
- **Coming Soon** listed in README - time to deliver
- Gemini excels at code generation and refactoring
- Provides cost-effective alternative to Claude
- Enables agent-to-engine assignment based on strengths

### Current Engine System

**Registry**: [src/infra/engines/core/registry.ts](src/infra/engines/core/registry.ts)
- Singleton with auto-discovery
- Existing engines: codex, claude, cursor, ccr, opencode, auggie
- Engines implement `EngineModule` interface

**Required Interface**:
```typescript
interface EngineModule {
  metadata: EngineMetadata;
  auth: EngineAuthModule;
  run: (options: EngineRunOptions) => Promise<EngineRunResult>;
  syncConfig?: () => Promise<void>;
  onRegister?: () => void;
  onLoad?: () => void;
}
```

### Implementation

#### New Directory Structure

**[src/infra/engines/providers/gemini/](src/infra/engines/providers/gemini/)**

```
gemini/
├── index.ts              - Module export (implements EngineModule)
├── metadata.ts           - Engine metadata
├── auth.ts               - API key authentication
├── config.ts             - Configuration helpers
└── execution/
    ├── runner.ts         - Main execution (calls API)
    ├── api-client.ts     - Gemini API wrapper (@google/generative-ai)
    ├── stream-parser.ts  - Parse streaming responses
    └── telemetry.ts      - Token counting and cost calculation
```

#### Files to Modify

**[src/infra/engines/core/registry.ts](src/infra/engines/core/registry.ts)**
- Import gemini engine (line 9 area)
- Add to `engineModules` array

**[package.json](package.json)**
- Add `@google/generative-ai` dependency

#### Key Files to Create

**metadata.ts**:
```typescript
export const metadata: EngineMetadata = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini AI with advanced reasoning',
  cliCommand: 'gemini',
  cliBinary: undefined,        // No CLI needed (direct API)
  installCommand: undefined,   // SDK is dev dependency
  defaultModel: 'gemini-2.0-flash-thinking-exp-01-21',
  order: 1,                    // Prioritize based on strengths
  experimental: false,
};
```

**auth.ts**:
- Check `GOOGLE_API_KEY` env var or `.codemachine/config.json`
- `login()` prompts for API key and saves
- `logout()` clears stored key
- Pattern: similar to Claude auth

**execution/api-client.ts**:
```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function createGeminiClient(apiKey: string) {
  return new GoogleGenerativeAI(apiKey);
}

export async function streamGenerateContent(
  model: string,
  messages: Message[],
  options: GenerateOptions
): Promise<StreamingResponse> {
  // Convert to Gemini format
  // Stream response chunks
  // Handle errors and rate limits
}
```

**execution/runner.ts**:
- Initialize API client
- Stream chat completion
- Parse chunks and emit to logger
- **Detect `RESOURCE_EXHAUSTED` errors** (status 429)
- Return `isRateLimitError: true` for rate limits
- Parse telemetry from `usageMetadata`
- Calculate costs using Gemini pricing

#### Design Decision: Direct API Integration

**Approach**: Use `@google/generative-ai` SDK directly (not CLI wrapper)

**Why**:
- No external binary dependency
- Better error handling
- Direct access to response metadata
- Easier to test and mock
- More reliable than CLI

**Auth**: API key via `GOOGLE_API_KEY` env var or config file

---

## Agent-to-Engine Assignment

After Gemini integration, we can assign agents based on documented AI strengths:

### Gemini Strengths
- Code generation and refactoring
- Complex reasoning and planning
- Mathematical and logical tasks
- Fast response times

### Claude Strengths
- Long-context understanding
- Nuanced instruction following
- Writing and documentation
- Code review and analysis

### Suggested Assignment

| Agent Type | Primary Engine | Fallback | Rationale |
|------------|---------------|----------|-----------|
| CODE-GEN | Gemini | Claude | Code generation is Gemini's strength |
| ARCH | Gemini | Claude | Complex reasoning and planning |
| REFACTOR | Gemini | Claude | Code transformation |
| TEST-GEN | Gemini | Claude | Code generation |
| DOC-WRITER | Claude | Gemini | Writing and long-context |
| REVIEWER | Claude | Gemini | Nuanced analysis |
| PLANNER | Claude | Gemini | Instruction following |
| CONTEXT-ANALYZER | Claude | Gemini | Long-context understanding |

This assignment can be:
- Hardcoded in workflow YAML
- Configurable via settings
- Auto-selected based on task type

---

## Critical Files Reference

### Enhancement 1: Rich Activity Context
- [src/cli/tui/routes/workflow/state/types.ts](src/cli/tui/routes/workflow/state/types.ts) - Extend AgentState
- [src/workflows/events/types.ts](src/workflows/events/types.ts) - Add event types
- [src/workflows/events/emitter.ts](src/workflows/events/emitter.ts) - Add emitter methods
- [src/cli/tui/routes/workflow/adapters/opentui.ts](src/cli/tui/routes/workflow/adapters/opentui.ts) - Handle events
- [src/cli/tui/routes/workflow/components/timeline/main-agent-node.tsx](src/cli/tui/routes/workflow/components/timeline/main-agent-node.tsx) - Update UI
- [src/agents/runner/runner.ts](src/agents/runner/runner.ts) - Emit context updates
- **NEW**: [src/agents/runner/parser.ts](src/agents/runner/parser.ts) - Tool parser

### Enhancement 2: Rate Limit Handling
- [src/infra/engines/core/types.ts](src/infra/engines/core/types.ts) - Add rate limit fields
- [src/infra/engines/providers/claude/execution/runner.ts](src/infra/engines/providers/claude/execution/runner.ts) - Enhance detection
- [src/infra/engines/providers/codex/execution/runner.ts](src/infra/engines/providers/codex/execution/runner.ts) - Add detection
- [src/workflows/execution/step.ts](src/workflows/execution/step.ts) - Integrate fallback
- [src/workflows/events/types.ts](src/workflows/events/types.ts) - Add events
- **NEW**: [src/workflows/execution/rate-limit-manager.ts](src/workflows/execution/rate-limit-manager.ts)
- **NEW**: [src/workflows/execution/engine-fallback.ts](src/workflows/execution/engine-fallback.ts)
- **NEW**: [src/workflows/execution/rate-limit-monitor.ts](src/workflows/execution/rate-limit-monitor.ts)

### Enhancement 3: Summary Generator
- [src/workflows/execution/runner.ts](src/workflows/execution/runner.ts) - Hook at line 352 and end
- [src/runtime/services/workspace/init.ts](src/runtime/services/workspace/init.ts) - Create summaries dir
- [src/agents/monitoring/monitor.ts](src/agents/monitoring/monitor.ts) - Data source
- **NEW**: [src/workflows/execution/summary-generator.ts](src/workflows/execution/summary-generator.ts)

### Enhancement 4: Gemini Integration
- [src/infra/engines/core/registry.ts](src/infra/engines/core/registry.ts) - Register engine
- [package.json](package.json) - Add dependency
- **NEW**: [src/infra/engines/providers/gemini/](src/infra/engines/providers/gemini/) - Entire directory

---

## Implementation Phases

### Phase 1: Foundation & Dependencies
**Effort**: 1-2 hours | **Risk**: Low

1. Add `@google/generative-ai` to package.json
2. Update `.gitignore` template
3. Create summaries directory scaffold
4. Create rate-limits.json structure

### Phase 2: Rich Activity Context
**Effort**: 3-4 hours | **Risk**: Medium | **Requires Team Review**: ✅ Yes (UI)

1. Extend types and events (30 min)
2. Add emitter methods (30 min)
3. Create tool parser (1 hour)
4. Update adapter (30 min)
5. Modify UI component (1 hour)
6. Integrate into agent runner (1 hour)

**Complexity**: Requires careful output parsing

### Phase 3: Rate Limit Handling
**Effort**: 4-5 hours | **Risk**: High | **Requires Team Review**: Maybe

1. Create RateLimitManager with persistence (1.5 hours)
2. Add error types (30 min)
3. Update Claude runner (30 min)
4. Update Codex runner (30 min)
5. Create fallback wrapper (1 hour)
6. Create monitor (1 hour)
7. Integrate into step execution (30 min)
8. Add events (30 min)

**Complexity**: Critical path, affects all engines

### Phase 4: Summary Generator
**Effort**: 3-4 hours | **Risk**: Low | **Requires Team Review**: Maybe

1. Create generator module (1.5 hours)
2. Implement templates (1 hour)
3. Hook into runner (30 min)
4. Add workflow summary (1 hour)
5. Update .gitignore (15 min)

**Complexity**: Straightforward file generation

### Phase 5: Gemini Integration
**Effort**: 5-6 hours | **Risk**: High | **Requires Team Review**: ✅ Yes (new provider)

1. Create directory structure (30 min)
2. Implement metadata (30 min)
3. Implement auth (1 hour)
4. Create API client (1.5 hours)
5. Implement runner with streaming (2 hours)
6. Add RESOURCE_EXHAUSTED detection (30 min)
7. Register in registry (15 min)
8. Test with API (1 hour)
9. Document recommendations (30 min)

**Complexity**: New API integration, streaming, error handling

### Phase 6: Testing & Refinement
**Effort**: 2-3 hours | **Risk**: Low

- Unit tests
- Integration tests
- Manual TUI testing
- End-to-end verification

---

## Testing Strategy

### Unit Tests
- RateLimitManager state management
- Summary generator markdown output
- Gemini API client mocking
- Tool call parser edge cases

### Integration Tests
- Engine fallback flow
- Event emission and handling
- UI state updates
- Persistence (rate limits, summaries)

### Manual Tests
- TUI display with rich context
- Rate limit behavior (may need low-limit keys)
- Summary output quality
- Gemini streaming

### Pre-PR Checklist
```bash
bun run lint
bun run typecheck
bun test
```

---

## Recommended Implementation Order

1. **Summary Generator** (PR #1)
   - Easiest to implement
   - Immediate value
   - No dependencies
   - Low risk

2. **Rich Activity Context** (PR #2)
   - Enhances UX
   - Tests event system
   - Independent of other PRs
   - **Requires team review**

3. **Rate Limit Handling** (PR #3)
   - Critical for reliability
   - Can be tested with all engines
   - Should be merged before Gemini

4. **Gemini Integration** (PR #4)
   - Builds on rate limit handling
   - Final capstone
   - **Requires team review**

---

## Next Steps

### For Contributors

1. **Read** this proposal thoroughly
2. **Open issue(s)** for team review:
   - Option A: One umbrella issue linking to this document
   - Option B: Separate issues for each enhancement
3. **Wait for approval** before starting implementation
4. **Claim a PR** by commenting on the issue
5. **Follow** the implementation phases outlined above
6. **Submit focused PRs** with tests and documentation

### For Maintainers

1. **Review** this proposal for architectural concerns
2. **Approve** or request changes
3. **Prioritize** which enhancements to accept
4. **Assign** to contributors or mark as "help wanted"
5. **Review PRs** as they come in

---

## Questions or Concerns?

Open an issue or discuss in Discord (link in README).

**Document Version**: 1.0
**Last Updated**: 2025-12-18
