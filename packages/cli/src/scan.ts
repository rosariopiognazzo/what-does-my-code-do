import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import type { ChangeEvent, GraphSnapshot } from '@wdmcd/core';
import { createChangeEvent, getRepositoryState } from '@wdmcd/impact';
import { applySemanticModel } from '@wdmcd/semantic-rules';
import {
  persistSnapshot,
  readCapabilities,
  readConfig,
  readLatestSnapshot,
  readOpenQuestions,
} from '@wdmcd/store';

export interface ScanProjectResult {
  snapshot: GraphSnapshot;
  changeEvent?: ChangeEvent;
  cacheHit: boolean;
}

export async function scanProject(root: string): Promise<ScanProjectResult> {
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
  return { snapshot, cacheHit: analysis.cache.hit, ...(changeEvent ? { changeEvent } : {}) };
}
