import { describe, expect, it } from 'bun:test';

import { registry } from '../../../src/infra/engines/core/registry.js';

describe('CCR Engine Registry Integration', () => {
  it('registers CCR engine in the registry', () => {
    expect(registry.has('ccr')).toBe(true);
  });

  it('has correct CCR engine metadata', async () => {
    const ccrEngine = await registry.getAsync('ccr');

    expect(ccrEngine).toBeDefined();
    expect(ccrEngine?.metadata.id).toBe('ccr');
    expect(ccrEngine?.metadata.name).toBe('Claude Code Runner');
  });

  it('includes CCR in all registered engines', () => {
    const allIds = registry.getAllIds();
    expect(allIds).toContain('ccr');
  });

  it('CCR engine has auth and run methods', async () => {
    const ccrEngine = await registry.getAsync('ccr');

    expect(ccrEngine).toBeDefined();
    expect(ccrEngine?.auth).toBeDefined();
    expect(typeof ccrEngine?.run).toBe('function');
  });

  it('CCR engine is properly ordered', async () => {
    const allEngines = await registry.getAllAsync();
    const ccrEngine = allEngines.find(engine => engine.metadata.id === 'ccr');

    expect(ccrEngine).toBeDefined();
    expect(ccrEngine?.metadata.order).toBe(5);
  });
});
