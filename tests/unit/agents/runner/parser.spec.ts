import { describe, it, expect } from 'bun:test';
import {
  parseToolUse,
  extractContextFromTool,
  extractGoal,
  type ToolUse,
  type ToolContext
} from '../../../../src/agents/runner/parser.js';

// Helper to build XML tool invocations without triggering tool parsing
function buildInvoke(name: string, params: Record<string, string>): string {
  const paramLines = Object.entries(params)
    .map(([key, value]) => `<parameter name="${key}">${value}<` + `/antml:parameter>`)
    .join('\n');
  return `<invoke name="${name}">\n${paramLines}\n<` + `/antml:invoke>`;
}

describe('Parser', () => {
  describe('parseToolUse', () => {
    describe('XML-style parsing (Anthropic/Claude format)', () => {
      it('parses antml:invoke format with file_path parameter', () => {
        const output = buildInvoke('Read', { file_path: '/src/index.ts' });
        const result = parseToolUse(output);

        expect(result.tool).toBe('Read');
        expect(result.parameters?.file_path).toBe('/src/index.ts');
      });

      it('parses antml:invoke format with multiple parameters', () => {
        const output = buildInvoke('Edit', {
          file_path: '/src/utils.ts',
          old_string: 'const x = 1',
          new_string: 'const x = 2'
        });
        const result = parseToolUse(output);

        expect(result.tool).toBe('Edit');
        expect(result.parameters?.file_path).toBe('/src/utils.ts');
        expect(result.parameters?.old_string).toBe('const x = 1');
        expect(result.parameters?.new_string).toBe('const x = 2');
      });

      it('parses Bash tool with command and description', () => {
        const output = buildInvoke('Bash', {
          command: 'npm test',
          description: 'Run tests'
        });
        const result = parseToolUse(output);

        expect(result.tool).toBe('Bash');
        expect(result.parameters?.command).toBe('npm test');
        expect(result.parameters?.description).toBe('Run tests');
      });

      it('parses the first tool invocation when multiple exist', () => {
        const output = buildInvoke('Read', { file_path: '/first.ts' }) + '\n' +
                       buildInvoke('Write', { file_path: '/second.ts' });
        const result = parseToolUse(output);

        expect(result.tool).toBe('Read');
        expect(result.parameters?.file_path).toBe('/first.ts');
      });
    });

    describe('JSON-style parsing (OpenAI format)', () => {
      it('parses JSON function call format', () => {
        const output = `{"function": {"name": "Read", "arguments": {"file_path": "/src/config.ts"}}}`;
        const result = parseToolUse(output);

        expect(result.tool).toBe('Read');
        expect(result.parameters?.file_path).toBe('/src/config.ts');
      });

      it('returns partial info when JSON parsing fails', () => {
        const output = `{"function": {"name": "Bash", "arguments": {invalid json}}}`;
        const result = parseToolUse(output);

        expect(result.tool).toBe('Bash');
        expect(result.parameters).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('returns empty object for non-tool output', () => {
        const output = 'This is just regular text without any tool calls.';
        const result = parseToolUse(output);

        expect(result.tool).toBeUndefined();
        expect(result.parameters).toBeUndefined();
      });

      it('returns empty object for empty string', () => {
        const result = parseToolUse('');
        expect(result.tool).toBeUndefined();
      });

      it('handles malformed XML gracefully', () => {
        const output = '<invoke name="Read"><parameter name="file_path">';
        const result = parseToolUse(output);

        // Should not match incomplete XML
        expect(result.tool).toBeUndefined();
      });
    });
  });

  describe('extractContextFromTool', () => {
    describe('file operations', () => {
      it('extracts context from Read tool', () => {
        const context = extractContextFromTool('Read', { file_path: '/src/components/Button.tsx' });

        expect(context.currentFile).toBe('/src/components/Button.tsx');
        expect(context.currentAction).toBe('Reading Button.tsx');
      });

      it('extracts context from Write tool', () => {
        const context = extractContextFromTool('Write', { file_path: '/src/utils/helpers.ts' });

        expect(context.currentFile).toBe('/src/utils/helpers.ts');
        expect(context.currentAction).toBe('Writing helpers.ts');
      });

      it('extracts context from Edit tool', () => {
        const context = extractContextFromTool('Edit', { file_path: '/src/index.ts' });

        expect(context.currentFile).toBe('/src/index.ts');
        expect(context.currentAction).toBe('Editing index.ts');
      });
    });

    describe('Bash tool', () => {
      it('uses description when available', () => {
        const context = extractContextFromTool('Bash', {
          command: 'npm run build',
          description: 'Build the project'
        });

        expect(context.currentFile).toBeUndefined();
        expect(context.currentAction).toBe('Build the project');
      });

      it('uses truncated command when no description', () => {
        const longCommand = 'npm run build && npm run test && npm run lint && echo "done"';
        const context = extractContextFromTool('Bash', { command: longCommand });

        expect(context.currentAction?.length).toBeLessThanOrEqual(53); // 50 + "..."
        expect(context.currentAction).toContain('...');
      });

      it('uses full command when short enough', () => {
        const context = extractContextFromTool('Bash', { command: 'npm test' });

        expect(context.currentAction).toBe('npm test');
      });
    });

    describe('search tools', () => {
      it('extracts context from Glob tool', () => {
        const context = extractContextFromTool('Glob', { pattern: '**/*.ts' });

        expect(context.currentAction).toBe('Searching: **/*.ts');
      });

      it('extracts context from Grep tool', () => {
        const context = extractContextFromTool('Grep', { pattern: 'TODO' });

        expect(context.currentAction).toBe('Searching: TODO');
      });
    });

    describe('other tools', () => {
      it('extracts context from Task tool', () => {
        const context = extractContextFromTool('Task', { description: 'Analyze codebase' });

        expect(context.currentAction).toBe('Analyze codebase');
      });

      it('extracts context from AskUserQuestion tool', () => {
        const context = extractContextFromTool('AskUserQuestion', {});

        expect(context.currentAction).toBe('Asking user question');
      });

      it('extracts context from WebFetch tool', () => {
        const context = extractContextFromTool('WebFetch', { url: 'https://example.com' });

        expect(context.currentAction).toBe('Searching web');
      });

      it('extracts context from WebSearch tool', () => {
        const context = extractContextFromTool('WebSearch', { query: 'react best practices' });

        expect(context.currentAction).toBe('Searching web');
      });

      it('handles unknown tools with generic action', () => {
        const context = extractContextFromTool('CustomTool', {});

        expect(context.currentAction).toBe('Using CustomTool tool');
      });
    });

    describe('edge cases', () => {
      it('returns empty context for missing file_path in file tools', () => {
        const context = extractContextFromTool('Read', {});

        expect(context.currentFile).toBeUndefined();
        expect(context.currentAction).toBeUndefined();
      });

      it('returns empty context for empty tool name', () => {
        const context = extractContextFromTool('', {});

        expect(context.currentFile).toBeUndefined();
        expect(context.currentAction).toBeUndefined();
      });
    });
  });

  describe('extractGoal', () => {
    describe('explicit goal patterns', () => {
      it('extracts goal from "Goal:" prefix', () => {
        const input = 'Goal: Implement user authentication for the application.';
        const goal = extractGoal(input);

        // Goal includes trailing punctuation as captured by the regex
        expect(goal).toBe('Implement user authentication for the application.');
      });

      it('extracts goal from "Task:" prefix', () => {
        const input = 'Task: Add dark mode support to the UI components.';
        const goal = extractGoal(input);

        expect(goal).toBe('Add dark mode support to the UI components.');
      });

      it('extracts goal from "Objective:" prefix', () => {
        const input = 'Objective: Refactor the database layer for better performance.';
        const goal = extractGoal(input);

        expect(goal).toBe('Refactor the database layer for better performance.');
      });
    });

    describe('implicit goal patterns', () => {
      it('extracts goal from "Please" prefix', () => {
        const input = 'Please add unit tests for the payment module.';
        const goal = extractGoal(input);

        expect(goal).toBe('add unit tests for the payment module');
      });

      it('extracts goal from "Help me" prefix', () => {
        const input = 'Help me fix the memory leak in the caching system.\nMore details here.';
        const goal = extractGoal(input);

        expect(goal).toBe('fix the memory leak in the caching system');
      });

      it('extracts goal from "I want to" prefix', () => {
        const input = 'I want to implement real-time notifications for users.';
        const goal = extractGoal(input);

        expect(goal).toBe('implement real-time notifications for users');
      });
    });

    describe('first sentence fallback', () => {
      it('uses first sentence when no pattern matches', () => {
        const input = 'Implementing a comprehensive error handling system for the API.\nThis includes custom error classes.';
        const goal = extractGoal(input);

        // First sentence is captured up to the period/newline boundary
        expect(goal).toBe('Implementing a comprehensive error handling system for the API');
      });
    });

    describe('filtering', () => {
      it('returns undefined for very short goals', () => {
        const input = 'Fix bug.';
        const goal = extractGoal(input);

        expect(goal).toBeUndefined();
      });

      it('returns undefined for very long goals', () => {
        const longGoal = 'A'.repeat(101);
        const input = `Goal: ${longGoal}`;
        const goal = extractGoal(input);

        expect(goal).toBeUndefined();
      });

      it('returns undefined for empty input', () => {
        const goal = extractGoal('');
        expect(goal).toBeUndefined();
      });
    });
  });
});
