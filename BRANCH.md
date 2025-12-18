# Fallback Chain Configuration Branch

## Purpose
Add multi-tier engine fallback chains and rate limit pause functionality to workflows, enabling robust handling of rate limits across multiple AI providers.

## Key Changes
- **Fallback Chain Field**: `fallbackChain?: string[]` added to `ModuleStep` for per-step engine fallback configuration
- **Rate Limit Waiting State**: New `waiting_for_rate_limit` workflow state with `RATE_LIMIT_WAIT` and `RATE_LIMIT_CLEAR` events
- **UI Countdown Timer**: Visual countdown in TelemetryBar showing time until rate limit clears
- **Toast Notifications**: User notification when entering rate limit waiting state
- **Updated Fallback Logic**: Engine-fallback now uses configured fallback chains

## Files Modified

### Workflow Templates
- `src/workflows/templates/types.ts` - Added `fallbackChain?: string[]` to ModuleStep

### State Machine
- `src/workflows/state/types.ts` - Added `waiting_for_rate_limit` state, `RATE_LIMIT_WAIT/CLEAR` events, context fields
- `src/workflows/state/machine.ts` - Added state transitions and handlers

### Engine Fallback
- `src/workflows/execution/engine-fallback.ts` - Updated to use fallback chains with step config support

### TUI State
- `src/cli/tui/routes/workflow/state/types.ts` - Added `RateLimitState` interface and `rate_limit_waiting` status

### UI State Management
- `src/cli/tui/routes/workflow/context/ui-state/types.ts` - Added `setRateLimitState` action type
- `src/cli/tui/routes/workflow/context/ui-state/actions/workflow-actions.ts` - Implemented action
- `src/cli/tui/routes/workflow/context/ui-state/initial-state.ts` - Added `rateLimitState: null` default

### Event Adapter
- `src/cli/tui/routes/workflow/adapters/opentui.ts` - Handle rate limit events from workflow

### UI Components
- `src/cli/tui/routes/workflow/components/output/telemetry-bar.tsx` - Added countdown timer display
- `src/cli/tui/routes/workflow/workflow-shell.tsx` - Added toast notification for rate limit state

### Tests
- `tests/integration/engines/engine-fallback.spec.ts` - Updated for new fallback behavior

## Usage Example

Configure fallback chains in workflow step definition:
```typescript
const step: ModuleStep = {
  name: 'code-generation',
  engine: 'claude',
  fallbackChain: ['gemini', 'codex'],  // Try these if claude is rate limited
  // ... other config
}
```

## Design Principles

1. **Cross-Brand Redundancy**: Fallback chains span multiple providers (Claude → Gemini → Codex)
2. **Tier Matching**: Fast agents fall back to other fast agents
3. **Final Safety**: Workflow pauses and waits if all engines exhausted
4. **Visual Feedback**: Users see countdown timer when rate limited

## Test Status
- **225 pass, 2 skip, 2 fail** (same as main branch pre-existing issues)
- All new functionality tested in engine-fallback.spec.ts

## Dependencies
- **Requires**: `rate-limit-handling` branch (for RateLimitManager)
- **Benefits from**: `testing-infrastructure` branch (for mock engine)

## Merge Order
This branch should be merged **after** `rate-limit-handling` as it extends that functionality.
