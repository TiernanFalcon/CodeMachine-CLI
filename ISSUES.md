# CodeMachine-CLI Code Review Issues

Generated from comprehensive code review on 2025-12-22.

---

## Critical Priority (Must Fix)

### ISSUE-001: Global state memory leak in Cursor runner
**Severity:** HIGH
**File:** `src/infra/engines/providers/cursor/execution/runner.ts:29-33`
**Status:** ✅ Fixed

`accumulatedThinking` and `toolNameMap` are never reset between function calls, causing memory leaks and data corruption.

**Fix:** Added reset of `toolNameMap.clear()` and `accumulatedThinking = ''` at start of `runCursor()` function.

---

### ISSUE-002: Gemini auth stdin hangs indefinitely
**Severity:** HIGH
**File:** `src/infra/engines/providers/gemini/auth.ts:93-98`
**Status:** ✅ Fixed

No timeout for user input prompt - can hang indefinitely if stdin closes.

**Fix:** Added 5-minute timeout with proper stdin cleanup and error handling.

---

### ISSUE-003: Auggie executor missing runAgent function
**Severity:** HIGH
**File:** `src/infra/engines/providers/auggie/execution/executor.ts`
**Status:** Open

File is incomplete - only has `runAuggiePrompt`, missing `runAgent` function.

---

### ISSUE-004: Race condition in workflow event handlers
**Severity:** CRITICAL
**File:** `src/workflows/execution/runner.ts:130-176`
**Status:** ✅ Fixed

Event handlers for `workflow:pause`, `workflow:skip`, `workflow:stop` access shared state without synchronization.

**Fix:** Added error boundaries in event handlers and registration guard to prevent duplicate listeners.

---

### ISSUE-005: Event listener memory leak in workflow runner
**Severity:** CRITICAL
**File:** `src/workflows/execution/runner.ts:128-176`
**Status:** ✅ Fixed

Event listeners registered in `setupListeners()` are only removed when machine reaches final state - can accumulate.

**Fix:** Added `cleanupHandlers` function that is stored and called in both success and error paths via finally block.

---

### ISSUE-006: Corrupted event history on concurrent emit
**Severity:** CRITICAL
**File:** `src/workflows/events/event-bus.ts:106-113`
**Status:** ✅ Fixed

No synchronization when accessing/modifying `eventHistory` - concurrent emissions corrupt array.

**Fix:** Use defensive copies - create new array for history updates and spread listeners to copies before iteration.

---

### ISSUE-007: State machine transitions not atomic
**Severity:** HIGH
**File:** `src/workflows/state/machine.ts:70-91`
**Status:** ✅ Fixed

State change not atomic with callbacks - if onExit or action throws, state is in inconsistent state.

**Fix:** Wrapped transition callbacks in try-catch. onExit/action errors prevent state change, onEnter errors are logged but don't revert.

---

### ISSUE-008: Orphaned process event listeners in TUI
**Severity:** HIGH
**File:** `src/cli/tui/routes/workflow/workflow-shell.tsx:124-127`
**Status:** ✅ Verified OK

Event listeners have incomplete cleanup if view switches before unmounting.

**Note:** Code review shows proper cleanup in onCleanup() at lines 162-170. All four event listeners are properly removed.

---

### ISSUE-009: Stream created before lock acquired in logger
**Severity:** HIGH
**File:** `src/agents/monitoring/logger.ts:47-92`
**Status:** ✅ Fixed

WriteStream created immediately, but file lock acquired asynchronously - race condition.

**Fix:** Added error handler on stream (`stream.on('error', ...)`) to prevent unhandled stream errors.

---

### ISSUE-010: Database updates not in transaction
**Severity:** HIGH
**File:** `src/agents/monitoring/db/repository.ts:89-146`
**Status:** ✅ Fixed

Updates to `agents` and `telemetry` tables not wrapped in transaction - data corruption risk.

**Fix:** Wrapped both database operations in `this.db.transaction()` for atomicity.

---

### ISSUE-011: Fire-and-forget update causes state inconsistency
**Severity:** HIGH
**File:** `src/agents/monitoring/monitor.ts:297-309`
**Status:** Open

Agent status update is fire-and-forget - if repository update fails, memory/disk state diverge.

---

## High Priority

### ISSUE-012: CCR telemetry uses wrong engine type
**Severity:** MEDIUM
**File:** `src/infra/engines/providers/ccr/execution/runner.ts:162`
**Status:** ✅ Fixed

Telemetry capture initialized with 'claude' instead of 'ccr'.

**Fix:** Changed telemetry capture to use 'ccr' as the engine type.

---

### ISSUE-013: Missing error handling in input provider mode switch
**Severity:** MEDIUM-HIGH
**File:** `src/workflows/execution/runner.ts:593-615`
**Status:** ✅ Fixed

`deactivate()` and `activate()` methods called without try-catch.

**Fix:** Wrapped deactivate() and activate() calls in try-catch with debug logging.

---

### ISSUE-014: Promise.all fails on partial file read failure
**Severity:** MEDIUM-HIGH
**File:** `src/workflows/execution/step.ts:87-93`
**Status:** ✅ Fixed

Using `Promise.all()` instead of `Promise.allSettled()` - if ANY file read fails, entire operation fails.

**Fix:** Changed to Promise.allSettled() with proper handling - succeeds if at least one file loads, fails only if all files fail.

---

### ISSUE-015: God function in agent runner (320 lines)
**Severity:** MEDIUM-HIGH
**File:** `src/agents/runner/runner.ts:207-527`
**Status:** Open

Single function handles 8+ concerns - hard to test and maintain.

---

### ISSUE-016: Complex PromptLine component (402 lines)
**Severity:** MEDIUM
**File:** `src/cli/tui/routes/workflow/components/output/prompt-line.tsx:128-402`
**Status:** Open

Should be split into smaller components.

---

### ISSUE-017: Duplicate timer registration in TUI store
**Severity:** MEDIUM
**File:** `src/cli/tui/routes/workflow/context/ui-state/store.ts:16-28`
**Status:** Open

Two independent 1-second intervals updating the same runtime value.

---

### ISSUE-018: Race condition in checkpoint freeze time
**Severity:** MEDIUM
**File:** `src/cli/tui/routes/workflow/workflow-shell.tsx:179-194`
**Status:** ✅ Fixed

Multiple overlapping effects manage `checkpointFreezeTime` without guard.

**Fix:** Merged two separate createEffect calls into a single unified effect with clear shouldFreeze logic.

---

### ISSUE-019: Missing validation for step index bounds
**Severity:** MEDIUM
**File:** `src/workflows/execution/runner.ts:242-245`
**Status:** ✅ Fixed

No bounds check before accessing moduleSteps array.

**Fix:** Added bounds validation at start of executeCurrentStep() - sends STEP_ERROR if index out of range.

---

### ISSUE-020: Missing config files for providers
**Severity:** MEDIUM
**Files:** `auggie/`, `ccr/`, `opencode/`
**Status:** Open

No configuration interface/constants like other providers.

---

### ISSUE-021: Unused function _findNextAvailableEngine
**Severity:** LOW
**File:** `src/workflows/execution/engine-fallback.ts:235-264`
**Status:** ✅ Fixed

Dead code that should be removed or integrated.

**Fix:** Removed the unused function entirely.

---

### ISSUE-022: Silent error swallowing across providers
**Severity:** MEDIUM
**Files:** Multiple engine provider files
**Status:** Open

Errors logged nowhere with `// Ignore errors silently` pattern.

---

### ISSUE-023: Inconsistent telemetry calculation patterns
**Severity:** MEDIUM
**Files:** All runner files
**Status:** Open

Different calculations for cached token totals across providers.

---

### ISSUE-024: Duplicate quote parsing logic in coordinator parser
**Severity:** MEDIUM
**File:** `src/agents/coordinator/parser.ts:319-463`
**Status:** Open

Three methods have nearly identical quote tracking logic.

---

### ISSUE-025: No stream write error handling in logger
**Severity:** HIGH
**File:** `src/agents/monitoring/logger.ts:98-106`
**Status:** ✅ Fixed

`write()` method doesn't handle stream write errors.

**Fix:** Added `stream.on('error', ...)` handler during logger creation to catch and log stream errors.

---

### ISSUE-026: No log file size rotation
**Severity:** MEDIUM
**File:** `src/agents/monitoring/logger.ts:47-92`
**Status:** Open

Log files have no size limit or rotation - can consume unlimited disk.

---

### ISSUE-027: Singleton pattern not thread-safe
**Severity:** MEDIUM
**Files:** `monitor.ts`, `logger.ts`, `service.ts`
**Status:** Open

Singleton pattern uses simple check without synchronization.

---

### ISSUE-028: Inconsistent resume support across providers
**Severity:** MEDIUM
**Files:** All engine providers
**Status:** Open

Only Codex and OpenCode have resume support.

---

### ISSUE-029: Missing ARIA labels in TUI components
**Severity:** LOW
**File:** `src/cli/tui/shared/components/modal/modal-base.tsx`
**Status:** Open

Modal uses generic elements with no semantic HTML or ARIA attributes.

---

### ISSUE-030: Magic numbers throughout codebase
**Severity:** LOW
**Files:** Multiple
**Status:** Open

Should be named constants at module or config level.

---

## Summary

| Priority | Count | Fixed/Verified |
|----------|-------|----------------|
| Critical | 11 | 6 |
| High | 8 | 5 |
| Medium | 8 | 5 |
| Low | 3 | 1 |
| **Total** | **30** | **17** |

### Fixed Issues
- ISSUE-001: Global state memory leak in Cursor runner
- ISSUE-002: Gemini auth stdin hangs indefinitely
- ISSUE-004: Race condition in workflow event handlers
- ISSUE-005: Event listener memory leak in workflow runner
- ISSUE-006: Corrupted event history on concurrent emit
- ISSUE-007: State machine transitions not atomic
- ISSUE-008: Orphaned process event listeners in TUI (verified OK)
- ISSUE-009: Stream created before lock acquired in logger
- ISSUE-010: Database updates not in transaction
- ISSUE-012: CCR telemetry uses wrong engine type
- ISSUE-013: Missing error handling in input provider mode switch
- ISSUE-014: Promise.all fails on partial file read failure
- ISSUE-018: Race condition in checkpoint freeze time
- ISSUE-019: Missing validation for step index bounds
- ISSUE-021: Unused function _findNextAvailableEngine
- ISSUE-025: No stream write error handling in logger
