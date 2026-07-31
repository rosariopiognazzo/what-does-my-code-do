import path from 'node:path';

import {
  buildCapabilityDetail,
  buildOverview,
  errorMessage,
  WDMCD_VERSION,
  WdmcdError,
} from '@wdmcd/core';
import { loadImpactReport } from '@wdmcd/impact';
import {
  parseOutputFormat,
  renderCapability,
  renderImpact,
  renderInit,
  renderOverview,
  renderScan,
  renderValidation,
  type OutputFormat,
} from '@wdmcd/renderers';
import {
  initializeProject,
  readChangeEvents,
  readLatestSnapshot,
  readOpenQuestions,
  validateProject,
} from '@wdmcd/store';
import { Command } from 'commander';
import openBrowser from 'open';
import pc from 'picocolors';

import { scanProject } from './scan.js';
import { startLocalServer } from './server.js';

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
    console.log(renderInit(await initializeProject(root), format));
  });

program
  .command('scan')
  .description('Analyze the current TypeScript or JavaScript working tree.')
  .action(async () => {
    const { root, format } = options();
    const { snapshot } = await scanProject(root);
    console.log(
      renderScan(
        {
          project: snapshot.project.name,
          ref: snapshot.project.scannedRef ?? 'working-tree',
          commit: snapshot.project.commit ?? 'uncommitted',
          snapshotId: snapshot.id,
          contentHash: snapshot.contentHash,
          files: snapshot.stats.files,
          nodes: snapshot.stats.nodes,
          edges: snapshot.stats.edges,
          routes: snapshot.nodes.filter((node) => node.kind === 'route').length,
          tests: snapshot.stats.tests,
          diagnostics: snapshot.diagnostics,
        },
        format,
      ),
    );
  });

program
  .command('overview')
  .description('Show the project through its capabilities and open questions.')
  .action(async () => {
    const { root, format } = options();
    const [snapshot, questions] = await Promise.all([
      readLatestSnapshot(root),
      readOpenQuestions(root),
    ]);
    if (!snapshot)
      throw new WdmcdError('SNAPSHOT_NOT_FOUND', 'No snapshot found. Run wdmcd scan first.');
    console.log(renderOverview(buildOverview(snapshot, questions), format));
  });

program
  .command('capability <name>')
  .description('Show one capability, its flow, components, and evidence.')
  .action(async (name: string) => {
    const { root, format } = options();
    const [snapshot, history] = await Promise.all([
      readLatestSnapshot(root),
      readChangeEvents(root),
    ]);
    if (!snapshot)
      throw new WdmcdError('SNAPSHOT_NOT_FOUND', 'No snapshot found. Run wdmcd scan first.');
    console.log(renderCapability(buildCapabilityDetail(snapshot, name, history), format));
  });

program
  .command('impact <range>')
  .description('Compare two scanned Git refs and explain architectural impact.')
  .action(async (rangeValue: string) => {
    const { root, format } = options();
    console.log(renderImpact(await loadImpactReport(root, rangeValue), format));
  });

program
  .command('open')
  .description('Start the local WDMCD interface.')
  .option('-p, --port <number>', 'preferred local port', '4317')
  .option('--no-browser', 'do not open the system browser')
  .action(async (commandOptions: { port: string; browser: boolean }) => {
    const { root } = options();
    await requireSnapshotForOpen(root);
    const port = Number.parseInt(commandOptions.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new WdmcdError('INVALID_PORT', `Invalid port: ${commandOptions.port}.`);
    }
    const server = await startLocalServer(root, port);
    console.log(`WDMCD interface: ${server.url}`);
    if (commandOptions.browser) await openBrowser(server.url);
    const close = async () => {
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });

async function requireSnapshotForOpen(root: string): Promise<void> {
  if (!(await readLatestSnapshot(root))) {
    throw new WdmcdError('SNAPSHOT_NOT_FOUND', 'No snapshot found. Run wdmcd scan first.');
  }
}

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
