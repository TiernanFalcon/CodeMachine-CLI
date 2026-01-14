/**
 * Workflow Test Scenarios
 *
 * Pre-defined workflow configurations for testing different execution paths.
 */

export interface TestWorkflowStep {
  type: 'module' | 'parallel' | 'checkpoint' | 'summary';
  agentId?: string;
  engine?: string;
  model?: string;
  steps?: TestWorkflowStep[];
}

export interface TestWorkflowScenario {
  name: string;
  description: string;
  steps: TestWorkflowStep[];
  expectedOutcome: 'success' | 'failure' | 'partial';
  expectedStepCount: number;
}

/**
 * Simple single-step workflow
 */
export const SINGLE_STEP_WORKFLOW: TestWorkflowScenario = {
  name: 'single-step',
  description: 'Simple workflow with one module step',
  steps: [
    {
      type: 'module',
      agentId: 'test-agent',
      engine: 'mock',
    },
  ],
  expectedOutcome: 'success',
  expectedStepCount: 1,
};

/**
 * Sequential multi-step workflow
 */
export const SEQUENTIAL_WORKFLOW: TestWorkflowScenario = {
  name: 'sequential',
  description: 'Workflow with multiple sequential steps',
  steps: [
    { type: 'module', agentId: 'planner', engine: 'mock' },
    { type: 'module', agentId: 'executor', engine: 'mock' },
    { type: 'module', agentId: 'reviewer', engine: 'mock' },
    { type: 'summary' },
  ],
  expectedOutcome: 'success',
  expectedStepCount: 4,
};

/**
 * Parallel execution workflow
 */
export const PARALLEL_WORKFLOW: TestWorkflowScenario = {
  name: 'parallel',
  description: 'Workflow with parallel step execution',
  steps: [
    { type: 'module', agentId: 'coordinator', engine: 'mock' },
    {
      type: 'parallel',
      steps: [
        { type: 'module', agentId: 'worker-1', engine: 'mock' },
        { type: 'module', agentId: 'worker-2', engine: 'mock' },
        { type: 'module', agentId: 'worker-3', engine: 'mock' },
      ],
    },
    { type: 'module', agentId: 'aggregator', engine: 'mock' },
  ],
  expectedOutcome: 'success',
  expectedStepCount: 5,
};

/**
 * Checkpoint workflow
 */
export const CHECKPOINT_WORKFLOW: TestWorkflowScenario = {
  name: 'checkpoint',
  description: 'Workflow with checkpoint for user approval',
  steps: [
    { type: 'module', agentId: 'analyzer', engine: 'mock' },
    { type: 'checkpoint' },
    { type: 'module', agentId: 'implementer', engine: 'mock' },
  ],
  expectedOutcome: 'success',
  expectedStepCount: 3,
};

/**
 * Mixed engine workflow
 */
export const MIXED_ENGINE_WORKFLOW: TestWorkflowScenario = {
  name: 'mixed-engines',
  description: 'Workflow using different engines per step',
  steps: [
    { type: 'module', agentId: 'fast-agent', engine: 'gemini' },
    { type: 'module', agentId: 'smart-agent', engine: 'claude' },
    { type: 'module', agentId: 'coding-agent', engine: 'codex' },
  ],
  expectedOutcome: 'success',
  expectedStepCount: 3,
};

/**
 * Error recovery workflow
 */
export const ERROR_RECOVERY_WORKFLOW: TestWorkflowScenario = {
  name: 'error-recovery',
  description: 'Workflow that should recover from errors',
  steps: [
    { type: 'module', agentId: 'risky-agent', engine: 'failing-mock' },
    { type: 'module', agentId: 'fallback-agent', engine: 'mock' },
  ],
  expectedOutcome: 'partial',
  expectedStepCount: 2,
};

/**
 * Get all test scenarios
 */
export function getAllTestScenarios(): TestWorkflowScenario[] {
  return [
    SINGLE_STEP_WORKFLOW,
    SEQUENTIAL_WORKFLOW,
    PARALLEL_WORKFLOW,
    CHECKPOINT_WORKFLOW,
    MIXED_ENGINE_WORKFLOW,
    ERROR_RECOVERY_WORKFLOW,
  ];
}

/**
 * Get scenario by name
 */
export function getScenarioByName(name: string): TestWorkflowScenario | undefined {
  return getAllTestScenarios().find((s) => s.name === name);
}
