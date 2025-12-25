import { describe, expect, it } from 'bun:test';

import { parseTelemetry as parseClaudeTelemetry } from '../../../src/infra/engines/providers/claude/telemetryParser.js';
import { parseTelemetry as parseCodexTelemetry } from '../../../src/infra/engines/providers/codex/telemetryParser.js';
import { parseTelemetry as parseCCRTelemetry } from '../../../src/infra/engines/providers/ccr/telemetryParser.js';
import { parseTelemetry as parseCursorTelemetry } from '../../../src/infra/engines/providers/cursor/telemetryParser.js';
import { parseTelemetry as parseAuggieTelemetry } from '../../../src/infra/engines/providers/auggie/telemetryParser.js';
import { parseTelemetry as parseOpenCodeTelemetry } from '../../../src/infra/engines/providers/opencode/telemetryParser.js';

describe('Telemetry Parsers', () => {
  describe('Claude telemetry parser', () => {
    it('parses valid result event with full usage data', () => {
      const json = {
        type: 'result',
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 100,
        },
        duration_ms: 1500,
        total_cost_usd: 0.05,
      };

      const result = parseClaudeTelemetry(json);

      expect(result).toEqual({
        duration: 1500,
        cost: 0.05,
        tokens: {
          input: 1000,
          output: 500,
          cached: 300, // 200 + 100
        },
      });
    });

    it('handles result event without cache tokens', () => {
      const json = {
        type: 'result',
        usage: {
          input_tokens: 500,
          output_tokens: 250,
        },
        duration_ms: 800,
        total_cost_usd: 0.02,
      };

      const result = parseClaudeTelemetry(json);

      expect(result).toEqual({
        duration: 800,
        cost: 0.02,
        tokens: {
          input: 500,
          output: 250,
          cached: undefined,
        },
      });
    });

    it('returns null for non-result event types', () => {
      const json = {
        type: 'message',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      expect(parseClaudeTelemetry(json)).toBeNull();
    });

    it('returns null for result event without usage', () => {
      const json = {
        type: 'result',
        duration_ms: 1000,
      };

      expect(parseClaudeTelemetry(json)).toBeNull();
    });

    it('returns null for null input', () => {
      expect(parseClaudeTelemetry(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(parseClaudeTelemetry('string')).toBeNull();
      expect(parseClaudeTelemetry(123)).toBeNull();
      expect(parseClaudeTelemetry(undefined)).toBeNull();
    });
  });

  describe('Codex telemetry parser', () => {
    it('parses valid turn.completed event', () => {
      const json = {
        type: 'turn.completed',
        usage: {
          input_tokens: 800,
          output_tokens: 400,
          cached_input_tokens: 150,
        },
      };

      const result = parseCodexTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 800,
          output: 400,
          cached: 150,
        },
      });
    });

    it('handles turn.completed without cached tokens', () => {
      const json = {
        type: 'turn.completed',
        usage: {
          input_tokens: 300,
          output_tokens: 100,
        },
      };

      const result = parseCodexTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 300,
          output: 100,
          cached: undefined,
        },
      });
    });

    it('returns null for non-turn.completed events', () => {
      const json = {
        type: 'item.completed',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      expect(parseCodexTelemetry(json)).toBeNull();
    });

    it('returns null for turn.completed without usage', () => {
      const json = {
        type: 'turn.completed',
      };

      expect(parseCodexTelemetry(json)).toBeNull();
    });
  });

  describe('CCR telemetry parser', () => {
    it('parses valid result event (same as Claude format)', () => {
      const json = {
        type: 'result',
        usage: {
          input_tokens: 1200,
          output_tokens: 600,
          cache_read_input_tokens: 400,
          cache_creation_input_tokens: 0,
        },
        duration_ms: 2000,
        total_cost_usd: 0.08,
      };

      const result = parseCCRTelemetry(json);

      expect(result).toEqual({
        duration: 2000,
        cost: 0.08,
        tokens: {
          input: 1200,
          output: 600,
          cached: 400,
        },
      });
    });

    it('returns null for non-result events', () => {
      expect(parseCCRTelemetry({ type: 'other' })).toBeNull();
    });
  });

  describe('Cursor telemetry parser', () => {
    it('parses valid result event (same as Claude format)', () => {
      const json = {
        type: 'result',
        usage: {
          input_tokens: 900,
          output_tokens: 450,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 50,
        },
        duration_ms: 1200,
        total_cost_usd: 0.04,
      };

      const result = parseCursorTelemetry(json);

      expect(result).toEqual({
        duration: 1200,
        cost: 0.04,
        tokens: {
          input: 900,
          output: 450,
          cached: 150,
        },
      });
    });

    it('returns null for non-result events', () => {
      expect(parseCursorTelemetry({ type: 'other' })).toBeNull();
    });
  });

  describe('Auggie telemetry parser', () => {
    it('parses valid step_finish event with tokens', () => {
      const json = {
        type: 'step_finish',
        part: {
          tokens: {
            input: 700,
            output: 350,
            cache: {
              read: 100,
              write: 50,
            },
          },
          cost: 0.03,
          duration: 1100,
        },
      };

      const result = parseAuggieTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 700,
          output: 350,
          cached: 150, // 100 + 50
        },
        cost: 0.03,
        duration: 1100,
      });
    });

    it('handles step_finish without cache', () => {
      const json = {
        type: 'step_finish',
        part: {
          tokens: {
            input: 400,
            output: 200,
          },
          cost: 0.02,
          duration: 800,
        },
      };

      const result = parseAuggieTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 400,
          output: 200,
          cached: undefined,
        },
        cost: 0.02,
        duration: 800,
      });
    });

    it('returns null for step_finish without part', () => {
      const json = {
        type: 'step_finish',
      };

      expect(parseAuggieTelemetry(json)).toBeNull();
    });

    it('returns null for step_finish without tokens in part', () => {
      const json = {
        type: 'step_finish',
        part: {
          cost: 0.01,
        },
      };

      expect(parseAuggieTelemetry(json)).toBeNull();
    });

    it('returns null for non-step_finish events', () => {
      const json = {
        type: 'message',
        part: { tokens: { input: 100, output: 50 } },
      };

      expect(parseAuggieTelemetry(json)).toBeNull();
    });
  });

  describe('OpenCode telemetry parser', () => {
    it('parses valid step_finish event with tokens', () => {
      const json = {
        type: 'step_finish',
        part: {
          tokens: {
            input: 600,
            output: 300,
            cache: {
              read: 80,
              write: 20,
            },
          },
          cost: 0.025,
        },
      };

      const result = parseOpenCodeTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 600,
          output: 300,
          cached: 100, // 80 + 20
        },
        cost: 0.025,
      });
    });

    it('handles step_finish without cache', () => {
      const json = {
        type: 'step_finish',
        part: {
          tokens: {
            input: 250,
            output: 125,
          },
          cost: 0.01,
        },
      };

      const result = parseOpenCodeTelemetry(json);

      expect(result).toEqual({
        tokens: {
          input: 250,
          output: 125,
          cached: undefined,
        },
        cost: 0.01,
      });
    });

    it('returns null for step_finish without part.tokens', () => {
      const json = {
        type: 'step_finish',
        part: {},
      };

      expect(parseOpenCodeTelemetry(json)).toBeNull();
    });

    it('returns null for non-step_finish events', () => {
      expect(parseOpenCodeTelemetry({ type: 'other' })).toBeNull();
    });
  });

  describe('Edge cases across all parsers', () => {
    const parsers = [
      { name: 'Claude', fn: parseClaudeTelemetry },
      { name: 'Codex', fn: parseCodexTelemetry },
      { name: 'CCR', fn: parseCCRTelemetry },
      { name: 'Cursor', fn: parseCursorTelemetry },
      { name: 'Auggie', fn: parseAuggieTelemetry },
      { name: 'OpenCode', fn: parseOpenCodeTelemetry },
    ];

    parsers.forEach(({ name, fn }) => {
      it(`${name}: returns null for empty object`, () => {
        expect(fn({})).toBeNull();
      });

      it(`${name}: returns null for array input`, () => {
        expect(fn([])).toBeNull();
      });

      it(`${name}: handles object without type property`, () => {
        expect(fn({ usage: { input_tokens: 100 } })).toBeNull();
      });
    });
  });
});
