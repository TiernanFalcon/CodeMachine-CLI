/**
 * Workflow-related errors
 *
 * Covers workflow execution, step processing, and coordination errors.
 */

import { CodeMachineError } from './base.js';

/**
 * Base class for all workflow errors
 */
export class WorkflowError extends CodeMachineError {
  readonly code = 'WORKFLOW_ERROR';
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
    this.workflowId = options?.workflowId;
  }
}

/**
 * Step execution failed
 */
export class StepExecutionError extends WorkflowError {
  readonly code = 'STEP_EXECUTION_FAILED';
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
    this.stepIndex = stepIndex;
    this.agentId = options?.agentId;
  }
}

/**
 * Invalid step type for operation
 */
export class InvalidStepTypeError extends WorkflowError {
  readonly code = 'INVALID_STEP_TYPE';
  readonly expectedType: string;
  readonly actualType: string;

  constructor(expectedType: string, actualType: string, operation: string) {
    super(`${operation} requires ${expectedType} step, got ${actualType}`);
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

/**
 * Fallback agent not configured or not found
 */
export class FallbackAgentError extends WorkflowError {
  readonly code = 'FALLBACK_AGENT_ERROR';
  readonly fallbackAgentId?: string;

  constructor(issue: 'not_configured' | 'not_found' | 'invalid_config', agentId?: string) {
    const messages = {
      not_configured: 'No fallback agent defined for this step',
      not_found: `Fallback agent not found: ${agentId}`,
      invalid_config: `Fallback agent ${agentId} is missing a promptPath configuration`,
    };
    super(messages[issue]);
    this.fallbackAgentId = agentId;
  }
}

/**
 * Coordination script error
 */
export class CoordinationError extends WorkflowError {
  readonly code = 'COORDINATION_ERROR';

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Invalid command syntax in coordination script
 */
export class InvalidCommandSyntaxError extends CoordinationError {
  readonly code = 'INVALID_COMMAND_SYNTAX';
  readonly commandStr: string;

  constructor(commandStr: string) {
    super(
      `Invalid command syntax: ${commandStr}\n` +
      `Expected: agent-name 'prompt' or agent[options] 'prompt'`
    );
    this.commandStr = commandStr;
  }
}

/**
 * Workflow was aborted
 */
export class WorkflowAbortedError extends WorkflowError {
  readonly code = 'WORKFLOW_ABORTED';

  constructor(reason: string, workflowId?: string) {
    super(`Workflow aborted: ${reason}`, { workflowId, recoverable: false });
  }
}

/**
 * Prompt file loading failed
 */
export class PromptLoadError extends WorkflowError {
  readonly code = 'PROMPT_LOAD_FAILED';
  readonly paths: string[];

  constructor(paths: string[], cause?: Error) {
    super(`Failed to read prompt files: ${paths.join(', ')}`, { cause });
    this.paths = paths;
  }
}
