import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { WorkflowStep } from '../templates/types.js';
import type { StepOutput } from '../state/types.js';
import { AgentMonitorService } from '../../agents/monitoring/monitor.js';

/**
 * Options for generating a step summary
 */
export interface GenerateStepSummaryOptions {
  step: WorkflowStep;
  output: StepOutput;
  stepIndex: number;
  savePath: string;
}

/**
 * Options for generating a workflow summary
 */
export interface GenerateWorkflowSummaryOptions {
  steps: WorkflowStep[];
  savePath: string;
  cmRoot: string;
}

/**
 * Parsed files from agent output
 */
interface ParsedFiles {
  created: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Parse agent output to extract file operations
 */
function parseAgentOutput(output: string): ParsedFiles {
  const files: ParsedFiles = {
    created: [],
    modified: [],
    deleted: []
  };

  // Parse for file write operations
  const writeMatches = output.matchAll(/(?:Writing|Created?)\s+(?:file\s+)?[`'"]?([^`'":\n]+\.(ts|tsx|js|jsx|json|md|css|html|py|java|go|rs|rb|php))[`'"]?/gi);
  for (const match of writeMatches) {
    if (match[1] && !files.created.includes(match[1])) {
      files.created.push(match[1]);
    }
  }

  // Parse for file edit operations
  const editMatches = output.matchAll(/(?:Editing|Modified?|Updated?)\s+(?:file\s+)?[`'"]?([^`'":\n]+\.(ts|tsx|js|jsx|json|md|css|html|py|java|go|rs|rb|php))[`'"]?/gi);
  for (const match of editMatches) {
    if (match[1] && !files.modified.includes(match[1]) && !files.created.includes(match[1])) {
      files.modified.push(match[1]);
    }
  }

  // Parse for file delete operations
  const deleteMatches = output.matchAll(/(?:Deleting|Deleted?|Removed?)\s+(?:file\s+)?[`'"]?([^`'":\n]+\.(ts|tsx|js|jsx|json|md|css|html|py|java|go|rs|rb|php))[`'"]?/gi);
  for (const match of deleteMatches) {
    if (match[1] && !files.deleted.includes(match[1])) {
      files.deleted.push(match[1]);
    }
  }

  return files;
}

/**
 * Extract key accomplishments from output
 */
function extractAccomplishments(output: string): string[] {
  const accomplishments: string[] = [];

  // Look for common patterns indicating accomplishments
  const patterns = [
    /(?:Successfully|Completed?|Finished|Done|Implemented?|Added|Created?|Fixed|Updated?|Refactored?)\s+(.+?)[\.\n]/gi,
    /✅\s*(.+?)[\.\n]/g,
    /✓\s*(.+?)[\.\n]/g
  ];

  for (const pattern of patterns) {
    const matches = output.matchAll(pattern);
    for (const match of matches) {
      const accomplishment = match[1]?.trim();
      if (accomplishment && accomplishment.length > 10 && accomplishment.length < 150) {
        accomplishments.push(accomplishment);
      }
    }
  }

  // Deduplicate and limit to 5
  return [...new Set(accomplishments)].slice(0, 5);
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms?: number): string {
  if (!ms) return 'N/A';

  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format cost in USD
 */
function formatCost(cost?: number): string {
  if (!cost) return 'N/A';
  return `$${cost.toFixed(4)}`;
}

/**
 * Generate a markdown summary for a single step
 */
export async function generateStepSummary(options: GenerateStepSummaryOptions): Promise<void> {
  const { step, output, stepIndex, savePath } = options;

  // Get agent data from monitoring service using the monitoringId from step output
  const monitorService = AgentMonitorService.getInstance();
  const agentData = output.monitoringId ? monitorService.getAgent(output.monitoringId) : undefined;

  // Parse output for file operations
  const files = parseAgentOutput(output.output);
  const accomplishments = extractAccomplishments(output.output);

  // Build markdown content
  const lines: string[] = [];

  const stepName = step.type === 'module' ? (step.agentName || step.agentId) : 'UI Step';
  lines.push(`# Step ${stepIndex + 1}: ${stepName}`);
  lines.push('');

  // Metadata section
  lines.push(`**Status**: ${agentData?.status || 'unknown'}`);
  lines.push(`**Duration**: ${formatDuration(agentData?.duration)}`);
  lines.push(`**Engine**: ${agentData?.engine || 'unknown'} (${agentData?.modelName || 'default model'})`);
  lines.push(`**Cost**: ${formatCost(agentData?.telemetry?.cost)}`);
  lines.push('');

  // Goal section (from step or prompt)
  if (step.type === 'module' && step.agentId) {
    lines.push('## Goal');
    lines.push(step.agentId.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()));
    lines.push('');
  }

  // Accomplishments section
  if (accomplishments.length > 0) {
    lines.push('## Accomplishments');
    accomplishments.forEach(acc => {
      lines.push(`- ${acc}`);
    });
    lines.push('');
  }

  // Files Modified section
  const hasFileChanges = files.created.length > 0 || files.modified.length > 0 || files.deleted.length > 0;
  if (hasFileChanges) {
    lines.push('## Files Modified');

    if (files.created.length > 0) {
      files.created.forEach(file => {
        lines.push(`- \`${file}\` - Created`);
      });
    }

    if (files.modified.length > 0) {
      files.modified.forEach(file => {
        lines.push(`- \`${file}\` - Modified`);
      });
    }

    if (files.deleted.length > 0) {
      files.deleted.forEach(file => {
        lines.push(`- \`${file}\` - Deleted`);
      });
    }

    lines.push('');
  }

  // Metrics section
  lines.push('## Metrics');
  lines.push(`- Tokens In: ${agentData?.telemetry?.tokensIn || 0}`);
  lines.push(`- Tokens Out: ${agentData?.telemetry?.tokensOut || 0}`);
  if (agentData?.telemetry?.cached) {
    lines.push(`- Cached Tokens: ${agentData.telemetry.cached}`);
  }
  lines.push('');

  // Output section (truncated)
  lines.push('## Output');
  const truncatedOutput = output.output.length > 500
    ? output.output.substring(0, 500) + '...\n\n(Output truncated. See full log file)'
    : output.output;
  lines.push('```');
  lines.push(truncatedOutput);
  lines.push('```');
  lines.push('');

  // Log file reference
  if (agentData?.logPath) {
    lines.push(`**Full log**: \`${agentData.logPath}\``);
    lines.push('');
  }

  // Write summary to file
  const content = lines.join('\n');
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, content, 'utf-8');
}

/**
 * Load step summaries from the summaries directory
 */
async function loadStepSummaries(cmRoot: string): Promise<string[]> {
  const summariesDir = path.join(cmRoot, 'summaries');
  const summaries: string[] = [];

  try {
    const files = await fs.readdir(summariesDir);
    const stepFiles = files
      .filter(f => f.startsWith('step-') && f.endsWith('.md'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/step-(\d+)/)?.[1] || '0');
        const numB = parseInt(b.match(/step-(\d+)/)?.[1] || '0');
        return numA - numB;
      });

    for (const file of stepFiles) {
      const content = await fs.readFile(path.join(summariesDir, file), 'utf-8');
      summaries.push(content);
    }
  } catch (error) {
    // Directory might not exist yet
  }

  return summaries;
}

/**
 * Generate a workflow-level summary
 */
export async function generateWorkflowSummary(options: GenerateWorkflowSummaryOptions): Promise<void> {
  const { steps, savePath, cmRoot } = options;

  // Load all step summaries
  const stepSummaries = await loadStepSummaries(cmRoot);

  // Build markdown content
  const lines: string[] = [];

  lines.push('# Workflow Summary');
  lines.push('');
  lines.push(`**Total Steps**: ${steps.length}`);
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push('');

  // Timeline section
  lines.push('## Timeline');
  lines.push('');
  steps.forEach((step, index) => {
    const statusEmoji = '✅'; // Could be determined from actual status
    const stepName = step.type === 'module' ? (step.agentName || step.agentId) : 'UI Step';
    lines.push(`${index + 1}. ${statusEmoji} **${stepName}**`);
  });
  lines.push('');

  // Links to step summaries
  lines.push('## Step Details');
  lines.push('');
  steps.forEach((step, index) => {
    const stepName = step.type === 'module' ? (step.agentName || step.agentId) : 'UI Step';
    lines.push(`- [Step ${index + 1}: ${stepName}](./step-${index}.md)`);
  });
  lines.push('');

  // Overall metrics (would need to aggregate from step summaries)
  lines.push('## Overall Metrics');
  lines.push('');
  lines.push('*Metrics aggregation coming soon*');
  lines.push('');

  // Write summary to file
  const content = lines.join('\n');
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, content, 'utf-8');
}
