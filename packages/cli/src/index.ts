import path from 'node:path';

import { errorMessage, WDMCD_VERSION, WdmcdError } from '@wdmcd/core';
import {
  parseOutputFormat,
  renderInit,
  renderValidation,
  type OutputFormat,
} from '@wdmcd/renderers';
import { initializeProject, validateProject } from '@wdmcd/store';
import { Command } from 'commander';
import pc from 'picocolors';

interface CliOptions {
  root: string;
  format: string;
}

const program = new Command();

function options(): { root: string; format: OutputFormat } {
  const values = program.opts<CliOptions>();
  return {
    root: path.resolve(values.root),
    format: parseOutputFormat(values.format),
  };
}

program
  .name('wdmcd')
  .description('Build an evidence-backed semantic map of a TypeScript project.')
  .version(WDMCD_VERSION)
  .option('-r, --root <path>', 'repository root', process.cwd())
  .option('--format <format>', 'output format: text or json', 'text');

program
  .command('init')
  .description('Create the minimal .wdmcd project files.')
  .action(async () => {
    const { root, format } = options();
    const result = await initializeProject(root);
    console.log(renderInit(result, format));
  });

program
  .command('validate')
  .description('Validate curated files, snapshots, and local references.')
  .action(async () => {
    const { root, format } = options();
    const result = await validateProject(root);
    console.log(renderValidation(result, format));
    if (!result.valid) process.exitCode = 1;
  });

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof WdmcdError && error.details.length > 0) {
    console.error(pc.red(error.message));
    for (const detail of error.details) console.error(`- ${detail}`);
  } else {
    console.error(pc.red(errorMessage(error)));
  }
  process.exitCode = 1;
}
