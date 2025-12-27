/**
 * Configuration Schemas
 *
 * Schema definitions and validators for configuration files.
 */

import {
  validateNonEmptyString,
  validateIdentifier,
  validateObject,
  validateArray,
  validateOptional,
  validateEnum,
  combineResults,
} from './validators.js';
import {
  ValidationResult,
  ValidationError,
  ConfigValidationError,
  validResult,
  invalidResult,
} from './errors.js';

// =============================================================================
// Agent Configuration Schema
// =============================================================================

export interface AgentConfigSchema {
  id: string;
  name?: string;
  model?: string;
  engine?: string;
  modelReasoningEffort?: 'low' | 'medium' | 'high';
  systemPrompt?: string;
  allowedTools?: string[];
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(
  config: unknown,
  configFile?: string
): ValidationResult<AgentConfigSchema> {
  const objResult = validateObject(config, 'agentConfig');
  if (!objResult.valid) return objResult as ValidationResult<AgentConfigSchema>;

  const obj = objResult.value!;
  const errors: ValidationError[] = [];

  // Required: id
  const idResult = validateIdentifier(obj.id, 'id');
  if (!idResult.valid) errors.push(...idResult.errors);

  // Optional: name
  if (obj.name !== undefined) {
    const nameResult = validateNonEmptyString(obj.name, 'name');
    if (!nameResult.valid) errors.push(...nameResult.errors);
  }

  // Optional: model
  if (obj.model !== undefined) {
    const modelResult = validateNonEmptyString(obj.model, 'model');
    if (!modelResult.valid) errors.push(...modelResult.errors);
  }

  // Optional: engine
  if (obj.engine !== undefined) {
    const engineResult = validateIdentifier(obj.engine, 'engine');
    if (!engineResult.valid) errors.push(...engineResult.errors);
  }

  // Optional: modelReasoningEffort
  if (obj.modelReasoningEffort !== undefined) {
    const effortResult = validateEnum(
      obj.modelReasoningEffort,
      'modelReasoningEffort',
      ['low', 'medium', 'high'] as const
    );
    if (!effortResult.valid) errors.push(...effortResult.errors);
  }

  // Optional: allowedTools
  if (obj.allowedTools !== undefined) {
    const toolsResult = validateArray<string>(obj.allowedTools, 'allowedTools');
    if (!toolsResult.valid) {
      errors.push(...toolsResult.errors);
    } else {
      for (const tool of toolsResult.value!) {
        const toolResult = validateNonEmptyString(tool, 'allowedTools[]');
        if (!toolResult.valid) errors.push(...toolResult.errors);
      }
    }
  }

  if (errors.length > 0) {
    if (configFile) {
      return invalidResult([
        ConfigValidationError.invalidSchema(
          configFile,
          errors.map(e => e.message)
        ),
      ]);
    }
    return invalidResult(errors);
  }

  return validResult(obj as AgentConfigSchema);
}

// =============================================================================
// Workflow Step Schema
// =============================================================================

export interface WorkflowStepSchema {
  type: 'module' | 'parallel' | 'checkpoint' | 'summary';
  agentId?: string;
  steps?: WorkflowStepSchema[];
  engine?: string;
  model?: string;
  label?: string;
}

/**
 * Validate workflow step configuration
 */
export function validateWorkflowStep(
  step: unknown,
  path: string = 'step'
): ValidationResult<WorkflowStepSchema> {
  const objResult = validateObject(step, path);
  if (!objResult.valid) return objResult as ValidationResult<WorkflowStepSchema>;

  const obj = objResult.value!;
  const errors: ValidationError[] = [];

  // Required: type
  const typeResult = validateEnum(obj.type, `${path}.type`, [
    'module',
    'parallel',
    'checkpoint',
    'summary',
  ] as const);
  if (!typeResult.valid) {
    errors.push(...typeResult.errors);
  } else {
    const stepType = typeResult.value!;

    // Type-specific validation
    if (stepType === 'module') {
      // module steps require agentId
      const agentResult = validateIdentifier(obj.agentId, `${path}.agentId`);
      if (!agentResult.valid) errors.push(...agentResult.errors);
    }

    if (stepType === 'parallel') {
      // parallel steps require nested steps array
      const stepsResult = validateArray<unknown>(obj.steps, `${path}.steps`);
      if (!stepsResult.valid) {
        errors.push(...stepsResult.errors);
      } else {
        // Recursively validate nested steps
        for (let i = 0; i < stepsResult.value!.length; i++) {
          const nestedResult = validateWorkflowStep(
            stepsResult.value![i],
            `${path}.steps[${i}]`
          );
          if (!nestedResult.valid) errors.push(...nestedResult.errors);
        }
      }
    }
  }

  // Optional: engine
  if (obj.engine !== undefined) {
    const engineResult = validateIdentifier(obj.engine, `${path}.engine`);
    if (!engineResult.valid) errors.push(...engineResult.errors);
  }

  // Optional: model
  if (obj.model !== undefined) {
    const modelResult = validateNonEmptyString(obj.model, `${path}.model`);
    if (!modelResult.valid) errors.push(...modelResult.errors);
  }

  if (errors.length > 0) {
    return invalidResult(errors);
  }

  return validResult(obj as WorkflowStepSchema);
}

// =============================================================================
// Environment Variable Schema
// =============================================================================

export interface EnvVarRequirement {
  name: string;
  required: boolean;
  validator?: (value: string) => ValidationResult<string>;
  description?: string;
}

/**
 * Validate environment variables against requirements
 */
export function validateEnvironmentVariables(
  requirements: EnvVarRequirement[]
): ValidationResult<Record<string, string>> {
  const errors: ValidationError[] = [];
  const values: Record<string, string> = {};

  for (const req of requirements) {
    const value = process.env[req.name];

    if (value === undefined || value === '') {
      if (req.required) {
        errors.push(
          ValidationError.required(`environment variable ${req.name}`)
        );
      }
      continue;
    }

    if (req.validator) {
      const result = req.validator(value);
      if (!result.valid) {
        errors.push(...result.errors);
        continue;
      }
    }

    values[req.name] = value;
  }

  if (errors.length > 0) {
    return invalidResult(errors);
  }

  return validResult(values);
}
