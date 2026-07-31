import path from 'node:path';

import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import {
  buildCapabilityDetail,
  buildOverview,
  errorMessage,
  WDMCD_VERSION,
  WdmcdError,
} from '@wdmcd/core';
import {
  buildImpactReport,
  createChangeEvent,
  getChangedFiles,
  getRepositoryState,
  parseGitRange,
  resolveCommit,
} from '@wdmcd/impact';
import {
  parseOutputFormat,
  renderCapability,
  renderInit,
  renderImpact,
  renderOverview,
  renderScan,
  renderValidation,
  type OutputFormat,
} from '@wdmcd/renderers';
import { applySemanticModel } from '@wdmcd/semantic-rules';
import {
  initializeProject,
  GraphDatabase,
  persistSnapshot,
  readCapabilities,
  readChangeEvents,
  readConfig,
  readLatestSnapshot,
  readOpenQuestions,
  validateProject,
} from '@wdmcd/store';
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
  .command('scan')
  .description('Analyze the current TypeScript or JavaScript working tree.')
  .action(async () => {
    const { root, format } = options();
    const config = await readConfig(root);
    const [project, repository, previous, capabilities, questions] = await Promise.all([
      discoverProject(root, config),
      getRepositoryState(root),
      readLatestSnapshot(root),
      readCapabilities(root),
      readOpenQuestions(root),
    ]);
    project.scannedRef = repository.ref;
    project.commit = repository.commit;
    const analysis = await analyzeTypescriptProject(root, config);
    const technicalSnapshot = buildTechnicalSnapshot({
      analysis,
      project,
      ...(previous ? { previous } : {}),
    });
    const snapshot = applySemanticModel({
      snapshot: technicalSnapshot,
      capabilities,
      questions,
      ...(previous ? { previous } : {}),
    });
    const changeEvent = createChangeEvent(previous, snapshot);
    await persistSnapshot(root, snapshot, changeEvent);
    console.log(
      renderScan(
        {
          project: project.name,
          ref: repository.ref,
          commit: repository.commit,
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
    const range = parseGitRange(rangeValue);
    const [baseCommit, headCommit, files] = await Promise.all([
      resolveCommit(root, range.base),
      resolveCommit(root, range.head),
      getChangedFiles(root, range),
    ]);
    const database = GraphDatabase.forProject(root);
    let baseSnapshot;
    let headSnapshot;
    try {
      baseSnapshot = database.snapshotForRef(range.base, baseCommit);
      headSnapshot = database.snapshotForRef(range.head, headCommit);
    } finally {
      database.close();
    }
    const missing = [
      ...(!baseSnapshot ? [`${range.base} @ ${baseCommit.slice(0, 12)}`] : []),
      ...(!headSnapshot ? [`${range.head} @ ${headCommit.slice(0, 12)}`] : []),
    ];
    if (!baseSnapshot || !headSnapshot) {
      throw new WdmcdError(
        'SNAPSHOT_NOT_FOUND',
        'Impact requires an evidence-backed snapshot for both refs.',
        [
          ...missing.map((ref) => `Missing: ${ref}`),
          'Check out each missing ref and run wdmcd scan once.',
        ],
      );
    }
    console.log(
      renderImpact(
        buildImpactReport({
          range: range.range,
          baseRef: range.base,
          headRef: range.head,
          base: baseSnapshot,
          head: headSnapshot,
          files,
        }),
        format,
      ),
    );
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
