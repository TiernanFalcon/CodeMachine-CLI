/**
 * Feature Test Workflow
 *
 * Tests all new CodeMachine features:
 * - Summary Generator (auto-generates .codemachine/summaries/)
 * - Activity Context (shows current file/action in TUI)
 * - Rate Limit Handling (detects rate limits, uses fallback)
 * - Fallback Chains (multi-tier engine fallback)
 * - Gemini Integration (Google Gemini as engine)
 *
 * Run with: codemachine --workflow feature-test "Create a hello world app"
 */

export default {
  name: 'Feature Test Workflow',
  controller: true,

  steps: [
    // ============================================
    // STEP 1: Test Gemini Integration
    // ============================================
    // Uses Gemini engine (requires GOOGLE_API_KEY)
    // Tests: Activity context, summary generator
    resolveStep('test-agent-1', {
      engine: 'gemini',
      model: 'gemini-2.0-flash-thinking-exp-01-21',
      agentName: 'Gemini Analyst',
    }),

    // ============================================
    // STEP 2: Test Claude with Fallback Chain
    // ============================================
    // Primary: Claude, Fallback: Gemini -> Codex
    // Tests: Fallback chain, rate limit detection
    resolveStep('test-agent-2', {
      engine: 'claude',
      model: 'sonnet',
      agentName: 'Claude Developer',
      fallbackChain: ['gemini', 'codex'],
    }),

    // ============================================
    // STEP 3: Test Codex with Fallback
    // ============================================
    // Primary: Codex, Fallback: Claude -> Gemini
    // Tests: Cross-brand fallback
    resolveStep('test-agent-3', {
      engine: 'codex',
      agentName: 'Codex Implementer',
      fallbackChain: ['claude', 'gemini'],
    }),

    // ============================================
    // STEP 4: Human Review Checkpoint
    // ============================================
    // Pause for human review
    resolveUI("Review the implementation"),

    // ============================================
    // STEP 5: Verification Loop with Fallback
    // ============================================
    // Tests: Loop behavior with fallback
    resolveModule('auto-loop', {
      loopSteps: 2,
      loopMaxIterations: 3,
      engine: 'claude',
      fallbackChain: ['gemini'],
    }),
  ],

  subAgentIds: ['frontend-dev', 'backend-dev'],
};
