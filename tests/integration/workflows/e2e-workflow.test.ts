/**
 * End-to-End Workflow Integration Tests
 *
 * Tests complete workflow execution paths using mock engines
 * for deterministic, repeatable testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import {
  SINGLE_STEP_WORKFLOW,
  SEQUENTIAL_WORKFLOW,
  PARALLEL_WORKFLOW,
  type TestWorkflowScenario,
} from '../../fixtures/workflow-scenarios.js';
import { createMockEngine } from '../../fixtures/mock-engine.js';

// Test workspace directory
let testDir: string;

describe('E2E Workflow Execution', () => {
  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `codemachine-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create .codemachine structure
    const codemachineDir = path.join(testDir, '.codemachine');
    await mkdir(path.join(codemachineDir, 'agents'), { recursive: true });
    await mkdir(path.join(codemachineDir, 'inputs'), { recursive: true });
    await mkdir(path.join(codemachineDir, 'logs'), { recursive: true });
    await mkdir(path.join(codemachineDir, 'memory'), { recursive: true });

    // Create test agent
    const agentDir = path.join(codemachineDir, 'agents', 'test-agent');
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, 'config.json'),
      JSON.stringify({
        id: 'test-agent',
        name: 'Test Agent',
        engine: 'mock',
      })
    );
    await writeFile(
      path.join(agentDir, 'prompt.md'),
      '# Test Agent\n\nThis is a test agent for E2E testing.'
    );

    // Create specifications file
    await writeFile(
      path.join(codemachineDir, 'inputs', 'specifications.md'),
      '# Test Specifications\n\nTest input for E2E testing.'
    );
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Workspace Setup', () => {
    it('should create valid test workspace', async () => {
      const { stat } = await import('node:fs/promises');

      // Verify directories exist
      await expect(stat(path.join(testDir, '.codemachine'))).resolves.toBeDefined();
      await expect(stat(path.join(testDir, '.codemachine', 'agents'))).resolves.toBeDefined();
      await expect(stat(path.join(testDir, '.codemachine', 'inputs'))).resolves.toBeDefined();
    });

    it('should have valid agent configuration', async () => {
      const { readFile } = await import('node:fs/promises');

      const configPath = path.join(testDir, '.codemachine', 'agents', 'test-agent', 'config.json');
      const content = await readFile(configPath, 'utf8');
      const config = JSON.parse(content);

      expect(config.id).toBe('test-agent');
      expect(config.name).toBe('Test Agent');
      expect(config.engine).toBe('mock');
    });
  });

  describe('Mock Engine', () => {
    it('should create mock engine with default options', () => {
      const engine = createMockEngine();

      expect(engine.metadata.id).toBe('mock');
      expect(engine.metadata.name).toBe('Mock Engine');
    });

    it('should simulate authentication', async () => {
      const authenticatedEngine = createMockEngine({ authenticated: true });
      const unauthenticatedEngine = createMockEngine({ authenticated: false });

      expect(await authenticatedEngine.auth.isAuthenticated()).toBe(true);
      expect(await unauthenticatedEngine.auth.isAuthenticated()).toBe(false);
    });

    it('should return mock responses', async () => {
      const engine = createMockEngine({
        responses: ['Response 1', 'Response 2'],
      });

      const results1: string[] = [];
      for await (const chunk of engine.run({ prompt: 'test', agentId: 'test' })) {
        if (chunk.type === 'result') {
          results1.push(chunk.content);
        }
      }
      expect(results1).toContain('Response 1');

      const results2: string[] = [];
      for await (const chunk of engine.run({ prompt: 'test', agentId: 'test' })) {
        if (chunk.type === 'result') {
          results2.push(chunk.content);
        }
      }
      expect(results2).toContain('Response 2');
    });

    it('should simulate response delay', async () => {
      const engine = createMockEngine({ responseDelay: 100 });

      const start = Date.now();
      for await (const _chunk of engine.run({ prompt: 'test', agentId: 'test' })) {
        // Consume chunks
      }
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Workflow Scenarios', () => {
    it('should define single-step workflow correctly', () => {
      expect(SINGLE_STEP_WORKFLOW.name).toBe('single-step');
      expect(SINGLE_STEP_WORKFLOW.steps).toHaveLength(1);
      expect(SINGLE_STEP_WORKFLOW.steps[0].type).toBe('module');
      expect(SINGLE_STEP_WORKFLOW.expectedOutcome).toBe('success');
    });

    it('should define sequential workflow correctly', () => {
      expect(SEQUENTIAL_WORKFLOW.name).toBe('sequential');
      expect(SEQUENTIAL_WORKFLOW.steps).toHaveLength(4);
      expect(SEQUENTIAL_WORKFLOW.expectedStepCount).toBe(4);
    });

    it('should define parallel workflow correctly', () => {
      expect(PARALLEL_WORKFLOW.name).toBe('parallel');

      // Find parallel step
      const parallelStep = PARALLEL_WORKFLOW.steps.find((s) => s.type === 'parallel');
      expect(parallelStep).toBeDefined();
      expect(parallelStep?.steps).toHaveLength(3);
    });
  });

  describe('Health Check Integration', () => {
    it('should run health checks on test workspace', async () => {
      const { runHealthChecks } = await import(
        '../../../src/runtime/services/health-check.js'
      );

      const report = await runHealthChecks(testDir, { skip: ['engines'] });

      expect(report.overall).not.toBe('unhealthy');
      expect(report.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Validation Integration', () => {
    it('should validate test workspace configuration', async () => {
      const { validateConfiguration } = await import(
        '../../../src/runtime/services/config-validator.js'
      );

      const report = await validateConfiguration(testDir, { skipEnv: true });

      // Should be valid with test agent
      expect(report.config.agents).toContain('test-agent');
    });
  });
});
