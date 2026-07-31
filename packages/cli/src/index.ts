import { Command } from 'commander';

import { WDMCD_VERSION } from '@wdmcd/core';

const program = new Command();

program
  .name('wdmcd')
  .description('Build an evidence-backed semantic map of a TypeScript project.')
  .version(WDMCD_VERSION);

await program.parseAsync();
