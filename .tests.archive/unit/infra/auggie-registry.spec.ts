import { describe, expect, it } from 'bun:test';

import { registry } from '../../../src/infra/engines/core/registry.js';

describe('Auggie Engine Registry Integration', () => {
  it('registers Auggie engine in the registry', () => {
    expect(registry.has('auggie')).toBe(true);
  });

  it('has correct Auggie engine metadata', async () => {
    const auggieEngine = await registry.getAsync('auggie');

    expect(auggieEngine).toBeDefined();
    expect(auggieEngine?.metadata.id).toBe('auggie');
    expect(auggieEngine?.metadata.name).toBe('Auggie CLI');
  });

  it('includes Auggie in all registered engines', () => {
    const allIds = registry.getAllIds();
    expect(allIds).toContain('auggie');
  });

  it('Auggie engine has auth and run methods', async () => {
    const auggieEngine = await registry.getAsync('auggie');

    expect(auggieEngine).toBeDefined();
    expect(auggieEngine?.auth).toBeDefined();
    expect(typeof auggieEngine?.run).toBe('function');
  });

  it('Auggie engine is properly ordered', async () => {
    const allEngines = await registry.getAllAsync();
    const auggieEngine = allEngines.find(engine => engine.metadata.id === 'auggie');

    expect(auggieEngine).toBeDefined();
    expect(auggieEngine?.metadata.order).toBe(5);
  });
});
