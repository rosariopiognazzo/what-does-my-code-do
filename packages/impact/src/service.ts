import { WdmcdError, type ImpactReport } from '@wdmcd/core';
import { GraphDatabase } from '@wdmcd/store';

import { getChangedFiles, parseGitRange, resolveCommit } from './git.js';
import { buildImpactReport } from './report.js';

export async function loadImpactReport(root: string, rangeValue: string): Promise<ImpactReport> {
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
  return buildImpactReport({
    range: range.range,
    baseRef: range.base,
    headRef: range.head,
    base: baseSnapshot,
    head: headSnapshot,
    files,
  });
}
