# Rate Limit Handling Branch

## Purpose
Detect rate limit errors immediately and automatically switch to fallback engines, ensuring workflows continue without interruption.

## Key Changes
- **Rate Limit Detection**: Identify rate limits from Claude, Codex, and other engines
- **Rate Limit Manager**: Track rate-limited engines with disk persistence
- **Engine Fallback**: Automatic fallback to available engines on rate limit
- **Event System**: New events for rate limit state changes

## Files Created/Modified

### New Files

#### Rate Limit Manager
`src/workflows/execution/rate-limit-manager.ts`
- `RateLimitManager` class with:
  - `markRateLimited(engineId, resetsAt)` - Track rate-limited engine
  - `isEngineAvailable(engineId)` - Check if engine is available
  - `getTimeUntilAvailable(engineId)` - Get remaining cooldown
  - `clearExpired()` - Remove expired entries
- Disk persistence to `.codemachine/rate-limits.json`
- Crash recovery: honors existing cooldowns on restart

#### Engine Fallback
`src/workflows/execution/engine-fallback.ts`
- `runWithFallback()` - Engine execution wrapper with fallback
- Tries primary engine first
- On rate limit, marks engine and tries next available
- Configurable max attempts
- Returns result with `engineUsed` field

### Modified Files

#### Engine Types
`src/infra/engines/core/types.ts` - Added to `EngineRunResult`:
```typescript
isRateLimitError?: boolean
rateLimitResetsAt?: Date
retryAfterSeconds?: number
```

#### Engine Runners
- `src/infra/engines/providers/claude/execution/runner.ts`
  - Detect `rate_limit` error code
  - Parse retry-after header
  - Return rate limit info in result

- `src/infra/engines/providers/codex/execution/runner.ts`
  - Detect HTTP 429 responses
  - Check for "quota" in error messages
  - Return rate limit info in result

#### Events
`src/workflows/events/types.ts` - Added:
- `engine:rate-limited` - Engine hit rate limit
- `engine:available` - Engine available again
- `engine:fallback` - Fallback triggered

`src/workflows/events/emitter.ts` - Added methods:
- `engineRateLimited(engineId, resetsAt, retryAfterSeconds)`
- `engineAvailable(engineId)`
- `engineFallback(fromEngine, toEngine, reason)`

## Usage

```typescript
import { createRateLimitManager, runWithFallback } from '@/workflows/execution'

const manager = await createRateLimitManager(cmRoot)

const result = await runWithFallback({
  primaryEngine: 'claude',
  runOptions: { prompt, workingDir },
  rateLimitManager: manager,
  emitter,
  agentId,
})

console.log(`Used engine: ${result.engineUsed}`)
```

## Persistence

Rate limit state is persisted to `.codemachine/rate-limits.json`:
```json
{
  "engines": {
    "claude": {
      "rateLimited": true,
      "resetsAt": "2025-12-18T09:30:00.000Z"
    }
  },
  "version": 1
}
```

## Test Status
- All tests passing
- Tested with mock rate limit scenarios

## Dependencies
- None - can be merged independently
- Foundation for `fallback-chain-config` branch

## Merge Order
Should be merged **before** `fallback-chain-config` which extends this functionality.
