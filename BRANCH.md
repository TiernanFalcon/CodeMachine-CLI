# Testing Infrastructure Branch

## Purpose
Add comprehensive testing infrastructure including a mock engine for deterministic testing and test suites for the new CodeMachine features.

## Key Changes
- **Mock Engine Provider**: Scriptable test engine that can simulate responses, rate limits, and errors
- **Unit Tests**: Tests for summary generator, tool call parser, rate limit manager, and Gemini engine
- **Integration Tests**: Tests for engine fallback behavior and workflow execution
- **Test Fixtures**: Shared mock configurations and canned responses

## Files Created

### Mock Engine (`src/infra/engines/providers/mock/`)
- `index.ts` - Main engine module export
- `metadata.ts` - Engine metadata (id: 'mock')
- `auth.ts` - Mock auth (always authenticated)
- `execution/runner.ts` - Scriptable response handler
- `execution/index.ts` - Re-exports

### Unit Tests (`tests/unit/`)
- `workflows/summary-generator.spec.ts` - Summary generator functionality
- `agents/runner/parser.spec.ts` - Tool call parsing for activity context
- `workflows/rate-limit-manager.spec.ts` - Rate limit state management
- `infra/engines/gemini.spec.ts` - Gemini engine and API client

### Integration Tests (`tests/integration/`)
- `engines/engine-fallback.spec.ts` - Engine selection and fallback behavior

### Other Changes
- Updated default models in engine providers to best versions (opus, gemini-1.5-pro)

## Test Status
- **225 pass, 2 skip, 2 fail** (pre-existing failures from main branch)
- All new tests passing

## How to Run Tests
```bash
bun test                          # Run all tests
bun test tests/unit               # Run unit tests only
bun test tests/integration        # Run integration tests only
```

## Mock Engine Usage
Enable the mock engine by setting environment variable:
```bash
CODEMACHINE_ENABLE_MOCK_ENGINE=1 bun test
```

Example mock configuration:
```typescript
import { setMockEngineConfig } from '@/infra/engines/providers/mock'

setMockEngineConfig({
  mode: 'scripted',
  scriptedResponses: [
    { output: 'Response 1', telemetry: { tokensIn: 100, tokensOut: 50 } },
    { output: 'Response 2', isRateLimitError: true }
  ]
})
```

## Dependencies
- None - can be merged independently
- Useful foundation for testing all other feature branches

## Merge Order
This branch should be merged **first** as it provides testing infrastructure for other features.
