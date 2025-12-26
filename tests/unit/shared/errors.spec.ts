import { describe, expect, it } from 'bun:test';

import {
  CodeMachineError,
  EngineError,
  EngineNotFoundError,
  NoEnginesRegisteredError,
  EngineAuthRequiredError,
  EngineExecutionError,
  EngineRateLimitError,
  ConfigError,
  AgentNotFoundError,
  AgentPromptConfigError,
  DatabaseError,
  DatabaseBusyError,
  RecordNotFoundError,
  WorkflowError,
  StepExecutionError,
  InvalidCommandSyntaxError,
  ValidationError,
  RequiredFieldError,
  PlaceholderError,
  isCodeMachineError,
  isRecoverableError,
  getErrorCode,
} from '../../../src/shared/errors/index.js';

describe('Error System', () => {
  describe('CodeMachineError base class', () => {
    // Create a concrete subclass for testing
    class TestError extends CodeMachineError {
      readonly code = 'TEST_ERROR';
    }

    it('sets name to constructor name', () => {
      const error = new TestError('test message');
      expect(error.name).toBe('TestError');
    });

    it('preserves error message', () => {
      const error = new TestError('test message');
      expect(error.message).toBe('test message');
    });

    it('defaults recoverable to false', () => {
      const error = new TestError('test');
      expect(error.recoverable).toBe(false);
    });

    it('allows setting recoverable', () => {
      const error = new TestError('test', { recoverable: true });
      expect(error.recoverable).toBe(true);
    });

    it('chains cause errors', () => {
      const cause = new Error('root cause');
      const error = new TestError('wrapper', { cause });
      expect(error.cause).toBe(cause);
    });

    it('getErrorChain returns all errors in chain', () => {
      const root = new Error('root');
      const middle = new TestError('middle', { cause: root });
      const top = new TestError('top', { cause: middle });

      const chain = top.getErrorChain();
      expect(chain).toHaveLength(3);
      expect(chain[0]).toBe(top);
      expect(chain[1]).toBe(middle);
      expect(chain[2]).toBe(root);
    });

    it('getFullMessage formats error chain', () => {
      const root = new Error('database connection failed');
      const error = new TestError('operation failed', { cause: root });

      const msg = error.getFullMessage();
      expect(msg).toContain('operation failed');
      expect(msg).toContain('Caused by: database connection failed');
    });
  });

  describe('Engine errors', () => {
    it('EngineNotFoundError includes available engines', () => {
      const error = new EngineNotFoundError('claude', ['codex', 'gemini']);
      expect(error.code).toBe('ENGINE_NOT_FOUND');
      expect(error.engineId).toBe('claude');
      expect(error.message).toContain('claude');
      expect(error.message).toContain('codex, gemini');
    });

    it('NoEnginesRegisteredError has correct message', () => {
      const error = new NoEnginesRegisteredError();
      expect(error.code).toBe('NO_ENGINES_REGISTERED');
      expect(error.message).toContain('No engines registered');
    });

    it('EngineAuthRequiredError is recoverable', () => {
      const error = new EngineAuthRequiredError('Claude', 'claude');
      expect(error.code).toBe('ENGINE_AUTH_REQUIRED');
      expect(error.recoverable).toBe(true);
      expect(error.message).toContain('Claude');
    });

    it('EngineExecutionError includes exit code', () => {
      const error = new EngineExecutionError('claude', 'process failed', {
        exitCode: 1,
      });
      expect(error.code).toBe('ENGINE_EXECUTION_FAILED');
      expect(error.exitCode).toBe(1);
    });

    it('EngineRateLimitError includes retry info', () => {
      const error = new EngineRateLimitError('claude', 30000);
      expect(error.code).toBe('ENGINE_RATE_LIMITED');
      expect(error.recoverable).toBe(true);
      expect(error.retryAfterMs).toBe(30000);
      expect(error.message).toContain('30s');
    });
  });

  describe('Config errors', () => {
    it('AgentNotFoundError includes available agents', () => {
      const error = new AgentNotFoundError('unknown-agent', ['agent1', 'agent2']);
      expect(error.code).toBe('AGENT_NOT_FOUND');
      expect(error.agentId).toBe('unknown-agent');
      expect(error.message).toContain('agent1, agent2');
    });

    it('AgentPromptConfigError handles different issues', () => {
      const empty = new AgentPromptConfigError('test', 'empty');
      expect(empty.message).toContain('empty');

      const invalid = new AgentPromptConfigError('test', 'invalid');
      expect(invalid.message).toContain('invalid');

      const missing = new AgentPromptConfigError('test', 'missing');
      expect(missing.message).toContain('missing');
    });
  });

  describe('Database errors', () => {
    it('DatabaseBusyError is recoverable', () => {
      const error = new DatabaseBusyError('insert');
      expect(error.code).toBe('DATABASE_BUSY');
      expect(error.recoverable).toBe(true);
    });

    it('DatabaseBusyError.isBusyError detects busy errors', () => {
      expect(DatabaseBusyError.isBusyError(new Error('SQLITE_BUSY'))).toBe(true);
      expect(DatabaseBusyError.isBusyError(new Error('database is locked'))).toBe(true);
      expect(DatabaseBusyError.isBusyError(new Error('database is busy'))).toBe(true);
      expect(DatabaseBusyError.isBusyError(new Error('other error'))).toBe(false);
      expect(DatabaseBusyError.isBusyError('not an error')).toBe(false);
    });

    it('RecordNotFoundError includes table and id', () => {
      const error = new RecordNotFoundError('agents', 123);
      expect(error.code).toBe('RECORD_NOT_FOUND');
      expect(error.table).toBe('agents');
      expect(error.id).toBe(123);
    });
  });

  describe('Workflow errors', () => {
    it('StepExecutionError includes step index', () => {
      const error = new StepExecutionError(2, 'agent failed', {
        agentId: 'test-agent',
      });
      expect(error.code).toBe('STEP_EXECUTION_FAILED');
      expect(error.stepIndex).toBe(2);
      expect(error.agentId).toBe('test-agent');
      expect(error.message).toContain('Step 2');
    });

    it('InvalidCommandSyntaxError includes command', () => {
      const error = new InvalidCommandSyntaxError('bad syntax here');
      expect(error.code).toBe('INVALID_COMMAND_SYNTAX');
      expect(error.commandStr).toBe('bad syntax here');
    });
  });

  describe('Validation errors', () => {
    it('RequiredFieldError includes field name', () => {
      const error = new RequiredFieldError('prompt', 'agent config');
      expect(error.code).toBe('REQUIRED_FIELD');
      expect(error.fieldName).toBe('prompt');
      expect(error.message).toContain('in agent config');
    });

    it('PlaceholderError includes placeholder name and path', () => {
      const error = new PlaceholderError('plan_fallback', '/path/to/file');
      expect(error.code).toBe('PLACEHOLDER_ERROR');
      expect(error.placeholderName).toBe('plan_fallback');
      expect(error.filePath).toBe('/path/to/file');
    });
  });

  describe('Helper functions', () => {
    it('isCodeMachineError identifies CodeMachine errors', () => {
      expect(isCodeMachineError(new EngineError('test'))).toBe(true);
      expect(isCodeMachineError(new DatabaseBusyError())).toBe(true);
      expect(isCodeMachineError(new Error('plain error'))).toBe(false);
      expect(isCodeMachineError('not an error')).toBe(false);
    });

    it('isRecoverableError checks recoverable flag', () => {
      expect(isRecoverableError(new DatabaseBusyError())).toBe(true);
      expect(isRecoverableError(new EngineRateLimitError('claude'))).toBe(true);
      expect(isRecoverableError(new ConfigError('test'))).toBe(false);
      expect(isRecoverableError(new Error('plain'))).toBe(false);
    });

    it('getErrorCode extracts error code', () => {
      expect(getErrorCode(new EngineNotFoundError('test'))).toBe('ENGINE_NOT_FOUND');
      expect(getErrorCode(new DatabaseBusyError())).toBe('DATABASE_BUSY');
      expect(getErrorCode(new Error('plain'))).toBe('UNKNOWN_ERROR');
      expect(getErrorCode('not an error')).toBe('INVALID_ERROR');
    });
  });
});
