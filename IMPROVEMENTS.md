# CodeMachine-CLI Improvements Roadmap

This document tracks planned improvements, enhancements, and technical debt items.

---

## Code Quality & Refactoring

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| High | **Agent Runner Refactor** | Break up 320-line god function in `src/agents/runner/runner.ts` into smaller, testable units | ✅ Done |
| High | **PromptLine Component** | Split 402-line component `src/cli/tui/routes/workflow/components/output/prompt-line.tsx` into smaller sub-components | ✅ Done |
| Medium | **Parser DRY Opportunities** | Review `src/agents/coordinator/parser.ts` for additional DRY improvements | Open |
| Low | **Magic Numbers** | Extract hardcoded constants (timeouts, limits, thresholds) into named constants | Open |

---

## Testing & Coverage

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| High | **TelemetryParser Coverage** | Add tests for `telemetryParser.ts` files (currently at 0% coverage) | ✅ Done |
| High | **Integration Tests** | Add end-to-end workflow execution tests | Open |
| Medium | **Provider Tests** | Improve coverage for engine providers (Gemini, Auggie, OpenCode) | Open |
| Medium | **TUI Component Tests** | Add UI component testing with mock adapters | Open |

---

## Features & Enhancements

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| High | **Log Rotation** | Add log file size limits and automatic rotation in `src/agents/monitoring/logger.ts` | ✅ Done |
| Medium | **Resume Support** | Implement consistent resume capability across all providers | Open |
| Medium | **Streaming Improvements** | Better progress indicators during long operations | Open |
| Low | **Accessibility** | Add ARIA labels for TUI components | Open |

---

## Architecture & Design

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| Medium | **Error Handling Standardization** | Standardize error handling patterns across all providers | Open |
| Medium | **Singleton Safety** | Review singleton patterns for thread safety edge cases | Open |
| Medium | **Typed Event System** | Consider implementing typed event emitter pattern | Open |
| Low | **Plugin Architecture** | Make engine providers more pluggable/extensible | Open |

---

## Documentation

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| Medium | **API Documentation** | Add JSDoc comments for public APIs | Open |
| Medium | **Architecture Docs** | Document system design decisions | Open |
| Low | **Contributing Guide** | Add setup and contribution guidelines | Open |

---

## Performance

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| Medium | **Memory Profiling** | Check for memory leaks in long-running workflows | Open |
| Medium | **Startup Optimization** | Improve lazy loading for faster startup | Open |
| Low | **Bundle Size** | Tree-shaking and dead code elimination | Open |

---

## DevOps & Tooling

| Priority | Item | Description | Status |
|----------|------|-------------|--------|
| Medium | **CI/CD Pipeline** | Set up automated testing on PRs | Open |
| Medium | **Pre-commit Hooks** | Add lint and type-check before commits | Open |
| Low | **Benchmarking** | Add performance regression tests | Open |

---

## Summary

| Category | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| Code Quality | 0 | 1 | 1 | 2 |
| Testing | 1 | 2 | 0 | 3 |
| Features | 0 | 2 | 1 | 3 |
| Architecture | 0 | 3 | 1 | 4 |
| Documentation | 0 | 2 | 1 | 3 |
| Performance | 0 | 2 | 1 | 3 |
| DevOps | 0 | 2 | 1 | 3 |
| **Total** | **1** | **14** | **6** | **21** |

---

## Change Log

| Date | Item | Change |
|------|------|--------|
| 2025-12-25 | PromptLine Split | Split 402-line component into 4 focused modules (212 lines main, modal, hook, helpers) |
| 2025-12-25 | Runner Refactor | Extracted helpers from 320-line executeAgent into resolveEngine, initializeMonitoring, resolveResumeSession |
| 2025-12-25 | Telemetry Tests | Added 41 tests for all telemetryParser.ts files (100% coverage) |
| 2025-12-25 | Log Rotation | Implemented size-based log rotation (10MB limit, 5 backups) |
| 2025-12-25 | Initial | Created roadmap document |
