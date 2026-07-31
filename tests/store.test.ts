import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { GraphSnapshot } from '@wdmcd/core';
import {
  GraphDatabase,
  appendChangeEvent,
  initializeProject,
  projectPaths,
  readConfig,
  readChangeEvents,
  validateProject,
} from '@wdmcd/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const temporaryRoot = path.resolve('tests/.tmp/store');

async function createRepository(): Promise<void> {
  await mkdir(path.join(temporaryRoot, '.git'), { recursive: true });
  await mkdir(path.join(temporaryRoot, 'src'), { recursive: true });
  await mkdir(path.join(temporaryRoot, 'apps'), { recursive: true });
  await writeFile(path.join(temporaryRoot, 'package.json'), '{"name":"fixture"}\n');
}

beforeEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
  await createRepository();
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('project files', () => {
  it('initializes a minimal project without overwriting curated files', async () => {
    const first = await initializeProject(temporaryRoot);
    expect(first.created).toEqual([
      '.wdmcd/config.json',
      '.wdmcd/capabilities.yaml',
      '.wdmcd/open-questions.yaml',
      '.wdmcd/.gitignore',
    ]);
    expect(await readConfig(temporaryRoot)).toMatchObject({
      version: 1,
      include: ['src', 'apps'],
    });

    const curated = 'capabilities:\n  - id: capability:billing\n    name: Billing\n';
    await writeFile(projectPaths(temporaryRoot).capabilities, curated);
    const second = await initializeProject(temporaryRoot);

    expect(second.created).toEqual([]);
    expect(second.existing).toHaveLength(4);
    expect(await readFile(projectPaths(temporaryRoot).capabilities, 'utf8')).toBe(curated);
    expect((await validateProject(temporaryRoot)).valid).toBe(true);
  });

  it('reports invalid configuration with an actionable file path', async () => {
    await initializeProject(temporaryRoot);
    await writeFile(projectPaths(temporaryRoot).config, '{"version":2}\n');

    const result = await validateProject(temporaryRoot);

    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      level: 'error',
      file: projectPaths(temporaryRoot).config,
      path: 'version',
    });
  });

  it('appends change history once per deterministic event id', async () => {
    await initializeProject(temporaryRoot);
    const event = {
      id: 'change:test',
      occurredAt: '2026-01-01T00:00:00.000Z',
      snapshotId: 'snapshot:test',
      summary: 'Initial fixture model.',
      capabilityIds: ['capability:test'],
      addedNodeIds: ['capability:test'],
      removedNodeIds: [],
      changedNodeIds: [],
      addedEdgeIds: [],
      removedEdgeIds: [],
      changedEdgeIds: [],
    };

    expect(await appendChangeEvent(temporaryRoot, event)).toBe(true);
    expect(await appendChangeEvent(temporaryRoot, event)).toBe(false);
    expect(await readChangeEvents(temporaryRoot)).toEqual([event]);
  });
});

describe('SQLite graph store', () => {
  it('round-trips a validated snapshot', async () => {
    await initializeProject(temporaryRoot);
    const now = '2026-01-01T00:00:00.000Z';
    const snapshot: GraphSnapshot = {
      modelVersion: 1,
      id: 'snapshot:abc',
      project: {
        id: 'project:fixture',
        name: 'fixture',
        root: temporaryRoot,
        packageManager: 'npm',
        frameworks: [],
        sourceRoots: ['src'],
        entrypoints: [],
      },
      scannedAt: now,
      contentHash: 'abc',
      nodes: [
        {
          id: 'project:fixture',
          kind: 'project',
          name: 'fixture',
          evidenceIds: ['evidence:package'],
          confidence: 'observed',
          createdAt: now,
          updatedAt: now,
        },
      ],
      edges: [],
      evidence: [
        {
          id: 'evidence:package',
          kind: 'observed',
          sourceType: 'file',
          path: 'package.json',
        },
      ],
      diagnostics: [],
      stats: { files: 1, nodes: 1, edges: 0, capabilities: 0, tests: 0 },
    };

    const database = GraphDatabase.forProject(temporaryRoot);
    try {
      database.saveSnapshot(snapshot);
      expect(database.latestSnapshot()).toEqual(snapshot);
    } finally {
      database.close();
    }
  });
});
