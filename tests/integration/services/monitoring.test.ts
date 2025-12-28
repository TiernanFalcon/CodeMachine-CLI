/**
 * Agent Monitor Service Integration Tests
 *
 * Tests agent lifecycle tracking and telemetry collection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { AgentMonitorService } from '../../../src/agents/monitoring/monitor.js';
import { AgentLoggerService } from '../../../src/agents/monitoring/logger.js';

let testDir: string;

describe('Agent Monitoring Integration', () => {
  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(tmpdir(), `codemachine-monitor-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(path.join(testDir, 'logs'), { recursive: true });

    // Reset singletons
    AgentMonitorService.resetInstance();
    AgentLoggerService.resetInstance();

    // Set up environment for test database
    process.env.CODEMACHINE_DB_PATH = path.join(testDir, 'agents.db');
  });

  afterEach(async () => {
    AgentMonitorService.resetInstance();
    AgentLoggerService.resetInstance();

    delete process.env.CODEMACHINE_DB_PATH;

    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = AgentMonitorService.getInstance();
      const instance2 = AgentMonitorService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = AgentMonitorService.getInstance();
      AgentMonitorService.resetInstance();
      const instance2 = AgentMonitorService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Agent Lifecycle', () => {
    it('should register agent and return ID', async () => {
      const monitor = AgentMonitorService.getInstance();

      const id = await monitor.register({
        name: 'test-agent',
        engine: 'mock',
        prompt: 'Test prompt',
      });

      expect(id).toBeGreaterThan(0);
    });

    it('should retrieve registered agent', async () => {
      const monitor = AgentMonitorService.getInstance();

      const id = await monitor.register({
        name: 'test-agent',
        engine: 'mock',
        prompt: 'Test prompt',
      });

      const agent = monitor.getAgent(id);

      expect(agent).toBeDefined();
      expect(agent?.name).toBe('test-agent');
      expect(agent?.engine).toBe('mock');
      expect(agent?.status).toBe('running');
    });

    it('should mark agent as completed', async () => {
      const monitor = AgentMonitorService.getInstance();

      const id = await monitor.register({
        name: 'test-agent',
        engine: 'mock',
        prompt: 'Test prompt',
      });

      await monitor.complete(id, {
        tokensIn: 100,
        tokensOut: 50,
        cachedTokens: 20,
      });

      const agent = monitor.getAgent(id);

      expect(agent?.status).toBe('completed');
      expect(agent?.telemetry?.tokensIn).toBe(100);
      expect(agent?.telemetry?.tokensOut).toBe(50);
    });

    it('should mark agent as failed', async () => {
      const monitor = AgentMonitorService.getInstance();

      const id = await monitor.register({
        name: 'test-agent',
        engine: 'mock',
        prompt: 'Test prompt',
      });

      await monitor.fail(id, 'Test error message');

      const agent = monitor.getAgent(id);

      expect(agent?.status).toBe('failed');
      expect(agent?.error).toBe('Test error message');
    });
  });

  describe('Query Agents', () => {
    it('should query agents by status', async () => {
      const monitor = AgentMonitorService.getInstance();

      const id1 = await monitor.register({
        name: 'agent-1',
        engine: 'mock',
        prompt: 'Prompt 1',
      });

      const id2 = await monitor.register({
        name: 'agent-2',
        engine: 'mock',
        prompt: 'Prompt 2',
      });

      await monitor.complete(id1);

      const running = monitor.queryAgents({ status: 'running' });
      const completed = monitor.queryAgents({ status: 'completed' });

      expect(running).toHaveLength(1);
      expect(running[0].name).toBe('agent-2');

      expect(completed).toHaveLength(1);
      expect(completed[0].name).toBe('agent-1');
    });

    it('should query agents by name', async () => {
      const monitor = AgentMonitorService.getInstance();

      await monitor.register({
        name: 'planner',
        engine: 'mock',
        prompt: 'Plan',
      });

      await monitor.register({
        name: 'executor',
        engine: 'mock',
        prompt: 'Execute',
      });

      const planners = monitor.queryAgents({ name: 'planner' });

      expect(planners).toHaveLength(1);
      expect(planners[0].name).toBe('planner');
    });
  });

  describe('Parent-Child Relationships', () => {
    it('should track parent-child agent relationships', async () => {
      const monitor = AgentMonitorService.getInstance();

      const parentId = await monitor.register({
        name: 'parent-agent',
        engine: 'mock',
        prompt: 'Parent prompt',
      });

      const childId = await monitor.register({
        name: 'child-agent',
        engine: 'mock',
        prompt: 'Child prompt',
        parentId,
      });

      const child = monitor.getAgent(childId);

      expect(child?.parentId).toBe(parentId);
    });

    it('should query children of parent agent', async () => {
      const monitor = AgentMonitorService.getInstance();

      const parentId = await monitor.register({
        name: 'parent',
        engine: 'mock',
        prompt: 'Parent',
      });

      await monitor.register({
        name: 'child-1',
        engine: 'mock',
        prompt: 'Child 1',
        parentId,
      });

      await monitor.register({
        name: 'child-2',
        engine: 'mock',
        prompt: 'Child 2',
        parentId,
      });

      const children = monitor.queryAgents({ parentId });

      expect(children).toHaveLength(2);
    });
  });
});
