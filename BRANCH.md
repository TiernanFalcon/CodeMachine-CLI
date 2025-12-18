# Gemini Integration Branch

## Purpose
Add Google Gemini as a fully integrated engine provider, enabling workflows to use Gemini AI models with streaming support, rate limit detection, and cost tracking.

## Key Changes
- **Direct API Integration**: Native Gemini API client (not CLI wrapper)
- **Streaming Support**: Real-time response streaming
- **Authentication**: API key via environment variable or config file
- **Rate Limit Detection**: Detect RESOURCE_EXHAUSTED errors
- **Telemetry**: Token counting and cost calculation

## Files Created

### Engine Provider (`src/infra/engines/providers/gemini/`)

#### `index.ts`
Main module export for engine registration

#### `metadata.ts`
```typescript
export const metadata: EngineMetadata = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google Gemini AI with advanced reasoning',
  defaultModel: 'gemini-2.0-flash-thinking-exp-01-21',
  order: 1,  // High priority
}
```

#### `auth.ts`
- `checkAuth()` - Verify `GOOGLE_API_KEY` env var or config
- `login()` - Prompt for API key, validate, and save
- `logout()` - Clear stored API key

#### `config.ts`
Configuration helpers for API key storage and retrieval

#### `execution/api-client.ts`
- `createGeminiClient()` - Initialize GoogleGenerativeAI client
- `streamGenerateContent()` - Stream chat completions
- Message format conversion (CodeMachine → Gemini)

#### `execution/runner.ts`
Main execution logic:
- Initialize client and model
- Stream response chunks to logger
- Detect RESOURCE_EXHAUSTED errors
- Return telemetry in result

#### `execution/telemetry.ts`
- Parse `usageMetadata` from responses
- Calculate costs using Gemini pricing tiers
- Support for Gemini 2.0 Flash and 1.5 Pro/Flash pricing

### Registry Update
`src/infra/engines/core/registry.ts` - Register Gemini engine

## Authentication

API key can be provided via:
1. **Environment variable**: `GOOGLE_API_KEY`
2. **Config file**: `.codemachine/config.json` → `engines.gemini.apiKey`

Login flow:
```bash
codemachine auth gemini
# Prompts for API key, validates with test call, saves to config
```

## Usage

In workflow step config:
```yaml
steps:
  - name: analyze-code
    engine: gemini
    model: gemini-1.5-pro  # Optional, defaults to gemini-2.0-flash-thinking-exp-01-21
```

## Supported Models

| Model | Use Case | Pricing (per 1K tokens) |
|-------|----------|------------------------|
| gemini-2.0-flash-thinking-exp-01-21 | Default, balanced | $0.075 in / $0.30 out |
| gemini-1.5-pro | Complex reasoning | $1.25 in / $5.00 out |
| gemini-1.5-flash | Fast, cost-effective | $0.075 in / $0.30 out |

## Rate Limit Handling

Gemini errors detected:
- HTTP 429 (Resource Exhausted)
- Error message containing "RESOURCE_EXHAUSTED"

On rate limit:
- `isRateLimitError: true` returned in result
- `retryAfterSeconds` parsed from response headers
- Works with rate-limit-handling branch for automatic fallback

## Test Status
- All tests passing
- Integration tested with live Gemini API

## Dependencies
- Uses native `fetch` for HTTP requests (no external dependencies for API calls)
- Benefits from `rate-limit-handling` branch for fallback

## Merge Order
Can be merged after or in parallel with other branches. No hard dependencies.
