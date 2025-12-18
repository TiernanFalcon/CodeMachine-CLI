# Summary Generator Branch

## Purpose
Generate markdown summaries after each workflow step and an overall workflow summary, providing documentation of what each agent accomplished.

## Key Changes
- **Step Summaries**: Generate markdown summary after each step completes
- **Workflow Summary**: Create overall summary when workflow finishes
- **Automatic File Detection**: Parse agent output for file operations
- **Telemetry Integration**: Include token counts and cost from AgentMonitorService
- **Non-Blocking**: Summary generation failures won't crash workflows

## Files Created/Modified

### New Files
- `src/workflows/execution/summary-generator.ts` - Main summary generation module with:
  - `generateStepSummary()` - Create markdown for individual steps
  - `generateWorkflowSummary()` - Create overall workflow summary
  - `parseFilesFromOutput()` - Extract file operations from agent output

### Modified Files
- `src/workflows/execution/runner.ts` - Hook summary generation at step completion and workflow end
- `src/runtime/services/workspace/init.ts` - Create `.codemachine/summaries/` directory
- `.gitignore` - Exclude summaries directory

## Output Location
Summaries are saved to `.codemachine/summaries/`:
- `step-0.md` - First step summary
- `step-1.md` - Second step summary
- `workflow-summary.md` - Overall workflow summary

## Summary Format

### Step Summary
```markdown
# Step N: [Agent Name]

**Status**: Completed | Failed | Skipped
**Duration**: X.Xs
**Engine**: claude (opus)
**Cost**: $X.XX

## Goal
[Step goal/objective from config]

## Accomplishments
- [Extracted from agent output]

## Files Modified
- `path/to/file.ts` - Created/Modified

## Metrics
- Tokens In: XXX
- Tokens Out: XXX
- Tool Calls: XX
```

### Workflow Summary
```markdown
# Workflow Summary: [Name]

**Status**: Completed | Stopped
**Duration**: Xm Xs
**Total Cost**: $X.XX

## Steps
| # | Agent | Status | Duration | Cost |
|---|-------|--------|----------|------|
| 0 | Agent1 | Completed | 5.2s | $0.12 |

## All Files Modified
- `file1.ts`
- `file2.ts`
```

## Test Status
- All tests passing
- Manually tested with workflow execution

## Dependencies
- None - can be merged independently

## Merge Order
Can be merged at any time. No dependencies on other feature branches.
