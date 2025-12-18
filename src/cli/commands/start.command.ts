import * as path from 'node:path';
import type { Command } from 'commander';
import chalk from 'chalk';

import { debug } from '../../shared/logging/logger.js';
import { clearTerminal } from '../../shared/utils/terminal.js';
import {
  getBuiltInPresetNames,
  isValidEngineId,
  getAvailableEngineIds,
} from '../../workflows/execution/engine-presets.js';

const DEFAULT_SPEC_PATH = '.codemachine/inputs/specifications.md';

type StartCommandOptions = {
  spec?: string;
  engine?: string;
  preset?: string;
};

export function registerStartCommand(program: Command): void {
  const presetNames = getBuiltInPresetNames().join(', ');
  const engineIds = getAvailableEngineIds().join(', ');

  program
    .command('start')
    .description('Run the workflow queue until completion (non-interactive)')
    .option('--spec <path>', 'Path to the planning specification file')
    .option('--engine <engine>', `Use a specific engine for all agents (${engineIds})`)
    .option('--preset <preset>', `Use an engine preset (${presetNames})`)
    .action(async (options: StartCommandOptions, command: Command) => {
      const cwd = process.env.CODEMACHINE_CWD || process.cwd();

      // Use command-specific --spec if provided, otherwise fall back to global --spec, then default
      const globalOpts = command.optsWithGlobals ? command.optsWithGlobals() : command.opts();
      const specPath = options.spec ?? globalOpts.spec ?? DEFAULT_SPEC_PATH;
      const specificationPath = path.resolve(cwd, specPath);

      // Validate engine if provided
      if (options.engine && !isValidEngineId(options.engine)) {
        console.error(chalk.red(`\nUnknown engine: ${options.engine}`));
        console.error(chalk.gray(`Available engines: ${engineIds}\n`));
        process.exit(1);
      }

      // Validate preset if provided
      if (options.preset) {
        const validPresets = getBuiltInPresetNames();
        if (!validPresets.includes(options.preset as typeof validPresets[number])) {
          console.error(chalk.red(`\nUnknown preset: ${options.preset}`));
          console.error(chalk.gray(`Available presets: ${presetNames}\n`));
          process.exit(1);
        }
      }

      debug(`Starting workflow (spec: ${specificationPath}, engine: ${options.engine ?? 'default'}, preset: ${options.preset ?? 'none'})`);

      // Comprehensive terminal clearing
      clearTerminal();

      const { runWorkflow } = await import('../../workflows/index.js');
      const { ValidationError } = await import('../../runtime/services/validation.js');

      try {
        await runWorkflow({
          cwd,
          specificationPath,
          engineOverride: options.engine,
          enginePreset: options.preset,
        });
        console.log('\n✓ Workflow completed successfully');
        process.exit(0);
      } catch (error) {
        if (error instanceof ValidationError) {
          console.log(`\n${error.message}\n`);
          process.exit(1);
        }
        console.error('\n✗ Workflow failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
