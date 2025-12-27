/**
 * Centralized Path Constants
 *
 * All .codemachine directory paths and common file locations
 * are defined here to ensure consistency across the codebase.
 */

import * as path from 'node:path';

/**
 * Root directory name for CodeMachine configuration
 */
export const CODEMACHINE_ROOT_DIR = '.codemachine';

/**
 * Subdirectory names within .codemachine
 */
export const CODEMACHINE_DIRS = {
  /** Agent definitions and configurations */
  AGENTS: 'agents',
  /** Input files including specifications */
  INPUTS: 'inputs',
  /** Log files and debug output */
  LOGS: 'logs',
  /** Memory storage for agent outputs */
  MEMORY: 'memory',
  /** Plan files and task breakdowns */
  PLAN: 'plan',
  /** Generated summaries */
  SUMMARIES: 'summaries',
  /** Workflow state and tracking */
  WORKFLOW: 'workflow',
  /** Template storage */
  TEMPLATES: 'templates',
} as const;

/**
 * Common file names within .codemachine
 */
export const CODEMACHINE_FILES = {
  /** Specification input file */
  SPECIFICATIONS: 'specifications.md',
  /** Agent configuration file */
  AGENTS_CONFIG: 'agents-config.json',
  /** Workflow tracking state */
  TRACKING: 'tracking.json',
  /** Controller configuration */
  CONTROLLER_STATE: 'controller-state.json',
  /** Behavior control file */
  BEHAVIOR: 'behavior.json',
  /** SQLite database for monitoring */
  REGISTRY_DB: 'registry.db',
  /** Debug log file */
  DEBUG_LOG: 'workflow-debug.log',
  /** Workflow summary */
  WORKFLOW_SUMMARY: 'workflow-summary.md',
} as const;

/**
 * Get the .codemachine root path for a given working directory
 */
export function getCodemachineRoot(cwd: string): string {
  return path.join(cwd, CODEMACHINE_ROOT_DIR);
}

/**
 * Get subdirectory paths within .codemachine
 */
export function getCodemachinePaths(cwd: string) {
  const root = getCodemachineRoot(cwd);

  return {
    root,
    agents: path.join(root, CODEMACHINE_DIRS.AGENTS),
    inputs: path.join(root, CODEMACHINE_DIRS.INPUTS),
    logs: path.join(root, CODEMACHINE_DIRS.LOGS),
    memory: path.join(root, CODEMACHINE_DIRS.MEMORY),
    plan: path.join(root, CODEMACHINE_DIRS.PLAN),
    summaries: path.join(root, CODEMACHINE_DIRS.SUMMARIES),
    workflow: path.join(root, CODEMACHINE_DIRS.WORKFLOW),
    templates: path.join(root, CODEMACHINE_DIRS.TEMPLATES),
  };
}

/**
 * Get common file paths within .codemachine
 */
export function getCodemachineFiles(cwd: string) {
  const paths = getCodemachinePaths(cwd);

  return {
    specifications: path.join(paths.inputs, CODEMACHINE_FILES.SPECIFICATIONS),
    agentsConfig: path.join(paths.agents, CODEMACHINE_FILES.AGENTS_CONFIG),
    tracking: path.join(paths.workflow, CODEMACHINE_FILES.TRACKING),
    controllerState: path.join(paths.workflow, CODEMACHINE_FILES.CONTROLLER_STATE),
    behavior: path.join(paths.memory, CODEMACHINE_FILES.BEHAVIOR),
    registryDb: path.join(paths.logs, CODEMACHINE_FILES.REGISTRY_DB),
    debugLog: path.join(paths.logs, CODEMACHINE_FILES.DEBUG_LOG),
    workflowSummary: path.join(paths.summaries, CODEMACHINE_FILES.WORKFLOW_SUMMARY),
  };
}

/**
 * Get step summary file path
 */
export function getStepSummaryPath(cwd: string, stepIndex: number): string {
  const paths = getCodemachinePaths(cwd);
  return path.join(paths.summaries, `step-${stepIndex}.md`);
}

/**
 * Default specification path relative to cwd
 */
export const DEFAULT_SPEC_PATH = path.join(
  CODEMACHINE_ROOT_DIR,
  CODEMACHINE_DIRS.INPUTS,
  CODEMACHINE_FILES.SPECIFICATIONS
);
