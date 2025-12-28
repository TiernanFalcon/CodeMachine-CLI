import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateStepSummary,
  generateWorkflowSummary,
} from '../../../src/workflows/execution/summary-generator.js';
import type { WorkflowStep } from '../../../src/workflows/templates/types.js';
import type { StepOutput } from '../../../src/workflows/state/types.js';

describe('SummaryGenerator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'summary-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('generateStepSummary', () => {
    it('generates markdown with step header', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'code-gen',
        agentName: 'Code Generator'
      };
      const output: StepOutput = {
        output: 'Successfully implemented the feature.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('# Step 1: Code Generator');
    });

    it('includes metrics section', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'test-agent'
      };
      const output: StepOutput = {
        output: 'Test output.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Metrics');
      expect(content).toContain('Tokens In:');
      expect(content).toContain('Tokens Out:');
    });

    it('parses file creation from output', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'code-gen'
      };
      const output: StepOutput = {
        output: 'Created file `src/components/Button.tsx`.\nWriting src/utils/helpers.ts',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Files Modified');
      expect(content).toContain('Button.tsx');
    });

    it('parses file modification from output', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'refactor-agent'
      };
      const output: StepOutput = {
        output: 'Modified src/index.ts to add exports.\nUpdated config.json with new settings.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('Modified');
    });

    it('extracts accomplishments from output', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'task-runner'
      };
      const output: StepOutput = {
        output: 'Successfully implemented the authentication flow.\nCompleted the database migration.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Accomplishments');
    });

    it('includes output section', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'test-agent'
      };
      const output: StepOutput = {
        output: 'This is the agent output text.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Output');
      expect(content).toContain('This is the agent output text.');
    });

    it('truncates very long output', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'verbose-agent'
      };
      const longOutput = 'x'.repeat(1000);
      const output: StepOutput = {
        output: longOutput,
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('truncated');
    });

    it('handles UI step type', async () => {
      const step: WorkflowStep = {
        type: 'ui-display',
        content: 'Some UI content'
      } as WorkflowStep;
      const output: StepOutput = {
        output: 'UI completed.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('# Step 1: UI Step');
    });

    it('creates summaries directory if it does not exist', async () => {
      const step: WorkflowStep = {
        type: 'module',
        agentId: 'test-agent'
      };
      const output: StepOutput = {
        output: 'Test output.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'nested', 'deep', 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('# Step 1');
    });
  });

  describe('generateWorkflowSummary', () => {
    it('generates workflow summary with total steps', async () => {
      const steps: WorkflowStep[] = [
        { type: 'module', agentId: 'analysis' },
        { type: 'module', agentId: 'code-gen' },
        { type: 'module', agentId: 'testing' }
      ];

      const savePath = join(tempDir, 'summaries', 'workflow-summary.md');
      await generateWorkflowSummary({ steps, savePath, cmRoot: tempDir });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('# Workflow Summary');
      expect(content).toContain('**Total Steps**: 3');
    });

    it('includes timeline section', async () => {
      const steps: WorkflowStep[] = [
        { type: 'module', agentId: 'step-1', agentName: 'First Step' },
        { type: 'module', agentId: 'step-2', agentName: 'Second Step' }
      ];

      const savePath = join(tempDir, 'summaries', 'workflow-summary.md');
      await generateWorkflowSummary({ steps, savePath, cmRoot: tempDir });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Timeline');
      expect(content).toContain('First Step');
      expect(content).toContain('Second Step');
    });

    it('includes links to step summaries', async () => {
      const steps: WorkflowStep[] = [
        { type: 'module', agentId: 'analysis' },
        { type: 'module', agentId: 'implementation' }
      ];

      const savePath = join(tempDir, 'summaries', 'workflow-summary.md');
      await generateWorkflowSummary({ steps, savePath, cmRoot: tempDir });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Step Details');
      expect(content).toContain('./step-0.md');
      expect(content).toContain('./step-1.md');
    });

    it('includes date in summary', async () => {
      const steps: WorkflowStep[] = [{ type: 'module', agentId: 'test' }];

      const savePath = join(tempDir, 'summaries', 'workflow-summary.md');
      await generateWorkflowSummary({ steps, savePath, cmRoot: tempDir });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('**Date**:');
      // Should contain ISO date format
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('handles empty steps array', async () => {
      const steps: WorkflowStep[] = [];

      const savePath = join(tempDir, 'summaries', 'workflow-summary.md');
      await generateWorkflowSummary({ steps, savePath, cmRoot: tempDir });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('**Total Steps**: 0');
    });
  });

  describe('file operation parsing patterns', () => {
    it('detects various file extensions', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'css', 'html', 'py', 'java', 'go', 'rs', 'rb', 'php'];

      for (const ext of extensions) {
        const output: StepOutput = {
          output: `Created file test.${ext}`,
          stepIndex: 0
        };

        const savePath = join(tempDir, `summaries-${ext}`, 'step-0.md');
        await generateStepSummary({ step, output, stepIndex: 0, savePath });

        const content = await readFile(savePath, 'utf8');
        // Should include Files Modified section for recognized extensions
        expect(content).toContain(`test.${ext}`);
      }
    });

    it('ignores non-code file extensions', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const output: StepOutput = {
        output: 'Created file test.txt and document.docx',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      // Should not contain Files Modified section for unrecognized extensions
      // The output section will still contain the raw text, so we check for the markdown format
      expect(content).not.toContain('`test.txt` - Created');
      expect(content).not.toContain('`document.docx` - Created');
    });

    it('deduplicates file entries', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const output: StepOutput = {
        output: 'Created file test.ts\nWriting file test.ts\nCreated test.ts again',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      // Count occurrences of the file entry format in Files Modified section
      // The markdown format is: `filename` - Created
      const filesModifiedSection = content.split('## Files Modified')[1]?.split('##')[0] || '';
      const matches = filesModifiedSection.match(/`test\.ts`/g) || [];
      expect(matches.length).toBe(1); // Should only appear once in Files Modified
    });
  });

  describe('accomplishment extraction', () => {
    it('extracts multiple accomplishment patterns', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const output: StepOutput = {
        output: `Successfully implemented user authentication.
Completed the database schema migration.
Fixed the memory leak in the caching layer.
Added comprehensive error handling.`,
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      expect(content).toContain('## Accomplishments');
    });

    it('limits accomplishments to 5', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const output: StepOutput = {
        output: Array(10).fill('Successfully completed task number X.').map((s, i) => s.replace('X', String(i + 1))).join('\n'),
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      // Count bullet points in accomplishments section
      const accomplishmentsSection = content.split('## Accomplishments')[1]?.split('##')[0] || '';
      const bulletPoints = (accomplishmentsSection.match(/^- /gm) || []).length;
      expect(bulletPoints).toBeLessThanOrEqual(5);
    });

    it('ignores very short accomplishments', async () => {
      const step: WorkflowStep = { type: 'module', agentId: 'test' };
      const output: StepOutput = {
        output: 'Fixed it.\nSuccessfully completed the implementation of a comprehensive error handling system.',
        stepIndex: 0
      };

      const savePath = join(tempDir, 'summaries', 'step-0.md');
      await generateStepSummary({ step, output, stepIndex: 0, savePath });

      const content = await readFile(savePath, 'utf8');
      // Should not include "it" (too short)
      expect(content).not.toContain('- it');
    });
  });
});
