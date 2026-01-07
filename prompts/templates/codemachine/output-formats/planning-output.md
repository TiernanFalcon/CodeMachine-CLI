## Plan Output Structure

Write your plan to the `.codemachine/artifacts/plan/` directory using the following file structure.

### Required Files

Create these files in the `.codemachine/artifacts/plan/` directory:

1. **`01_Plan_Overview_and_Setup.md`** - Contains:
   - Section 1: Project Overview
   - Section 2: Core Architecture Summary
   - Section 2.1: Key Artifacts Reference
   - Section 3: Directory Structure (complete tree)
   - Section 4: Directives & Strict Process

2. **`02_Iteration_I1.md`**, **`02_Iteration_I2.md`**, etc. - One file per iteration containing:
   - Iteration header with ID and Goal
   - All tasks for that iteration with full details

3. **`03_Verification_and_Glossary.md`** - Contains:
   - Section 6: Verification Strategy
   - Section 7: Glossary

### File Naming Rules

- Iteration files MUST match the pattern: `02_Iteration_I{n}.md`
  - Examples: `02_Iteration_I1.md`, `02_Iteration_I2.md`, `02_Iteration_I3.md`
- Use this exact naming - the Task Breakdown agent relies on this pattern to parse iterations

### Task Anchor Format

Each task in iteration files MUST have an anchor comment before it:

```markdown
<!-- anchor: task-{task_id} -->
```

Example iteration file structure:

```markdown
# Iteration I1

*   **Iteration ID:** `I1`
*   **Goal:** Set up project foundation and core infrastructure

---

<!-- anchor: task-I1-T1 -->

### Task I1-T1: Initialize Project Structure

*   **Task ID:** `I1-T1`
*   **Description:** Create the base project directory structure and configuration files.
*   **Agent Type Hint:** `setup-agent`
*   **Inputs:** Project requirements, tech stack decisions
*   **Input Files:** `[".codemachine/artifacts/architecture/architecture.md"]`
*   **Target Files:** `["package.json", "tsconfig.json", "src/index.ts"]`
*   **Deliverables:** Initialized project with base configuration
*   **Acceptance Criteria:** Project builds without errors, all config files valid
*   **Dependencies:** None
*   **Parallelizable:** Yes

---

<!-- anchor: task-I1-T2 -->

### Task I1-T2: Configure Development Environment

*   **Task ID:** `I1-T2`
...
```

### Important Notes

- Always create the `plan/` directory before writing files
- Each iteration file should be self-contained with all task details
- The anchor comments are required for the extraction script to parse tasks correctly
- Follow the field order shown in the example for consistency
