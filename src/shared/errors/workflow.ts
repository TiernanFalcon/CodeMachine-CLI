/**
 * Workflow-related errors
 *
 * Covers workflow execution, step processing, and coordination errors.
 */

import { CodeMachineError } from './base.js';

/**
 * Workflow error codes - union of all possible workflow error types
 */
export type WorkflowErrorCode =
  | 'WORKFLOW_ERROR'
  | 'STEP_EXECUTION_FAILED'
  | 'INVALID_STEP_TYPE'
  | 'FALLBACK_AGENT_ERROR'
  | 'COORDINATION_ERROR'
  | 'INVALID_COMMAND_SYNTAX'
  | 'WORKFLOW_ABORTED'
  | 'PROMPT_LOAD_FAILED';

/**
 * Base class for all workflow errors
 */
export class WorkflowError extends CodeMachineError {
  declare readonly code: WorkflowErrorCode;
  readonly workflowId?: string;

  constructor(
    message: string,
    options?: {
      workflowId?: string;
      cause?: Error;
      recoverable?: boolean;
    }
  ) {
    super(message, options);
    (this as { code: WorkflowErrorCode }).code = 'WORKFLOW_ERROR';
    this.workflowId = options?.workflowId;
  }
}

/**
 * Step execution failed
 */
export class StepExecutionError extends WorkflowError {
  declare readonly code: 'STEP_EXECUTION_FAILED';
  readonly stepIndex: number;
  readonly agentId?: string;

  constructor(
    stepIndex: number,
    message: string,
    options?: {
      agentId?: string;
      workflowId?: string;
      cause?: Error;
    }
  ) {
    super(`Step ${stepIndex} failed: ${message}`, options);
    (this as { code: 'STEP_EXECUTION_FAILED' }).code = 'STEP_EXECUTION_FAILED';
    this.stepIndex = stepIndex;
    this.agentId = options?.agentId;
  }
}

/**
 * Invalid step type for operation
 */
export class InvalidStepTypeError extends WorkflowError {
  declare readonly code: 'INVALID_STEP_TYPE';
  readonly expectedType: string;
  readonly actualType: string;

  constructor(expectedType: string, actualType: string, operation: string) {
    super(`${operation} requires ${expectedType} step, got ${actualType}`);
    (this as { code: 'INVALID_STEP_TYPE' }).code = 'INVALID_STEP_TYPE';
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

/**
 * Fallback agent not configured or not found
 */
export class FallbackAgentError extends WorkflowError {
  declare readonly code: 'FALLBACK_AGENT_ERROR';
  readonly fallbackAgentId?: string;

  constructor(issue: 'not_configured' | 'not_found' | 'invalid_config', agentId?: string) {
    const messages = {
      not_configured: 'No fallback agent defined for this step',
      not_found: `Fallback agent not found: ${agentId}`,
      invalid_config: `Fallback agent ${agentId} is missing a promptPath configuration`,
    };
    super(messages[issue]);
    (this as { code: 'FALLBACK_AGENT_ERROR' }).code = 'FALLBACK_AGENT_ERROR';
    this.fallbackAgentId = agentId;
  }
}

/**
 * Coordination error codes
 */
export type CoordinationErrorCode = 'COORDINATION_ERROR' | 'INVALID_COMMAND_SYNTAX';

/**
 * Coordination script error
 */
export class CoordinationError extends WorkflowError {
  declare readonly code: CoordinationErrorCode;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    (this as { code: CoordinationErrorCode }).code = 'COORDINATION_ERROR';
  }
}

/**
 * Invalid command syntax in coordination script
 */
export class InvalidCommandSyntaxError extends CoordinationError {
  declare readonly code: 'INVALID_COMMAND_SYNTAX';
  readonly commandStr: string;

  constructor(commandStr: string) {
    super(
      `Invalid command syntax: ${commandStr}\n` +
      `Expected: agent-name 'prompt' or agent[options] 'prompt'`
    );
    (this as { code: 'INVALID_COMMAND_SYNTAX' }).code = 'INVALID_COMMAND_SYNTAX';
    this.commandStr = commandStr;
  }
}

/**
 * Workflow was aborted
 */
export class WorkflowAbortedError extends WorkflowError {
  declare readonly code: 'WORKFLOW_ABORTED';

  constructor(reason: string, workflowId?: string) {
    super(`Workflow aborted: ${reason}`, { workflowId, recoverable: false });
    (this as { code: 'WORKFLOW_ABORTED' }).code = 'WORKFLOW_ABORTED';
  }
}

/**
 * Prompt file loading failed
 */
export class PromptLoadError extends WorkflowError {
  declare readonly code: 'PROMPT_LOAD_FAILED';
  readonly paths: string[];

  constructor(paths: string[], cause?: Error) {
    super(`Failed to read prompt files: ${paths.join(', ')}`, { cause });
    (this as { code: 'PROMPT_LOAD_FAILED' }).code = 'PROMPT_LOAD_FAILED';
    this.paths = paths;
  }
}
