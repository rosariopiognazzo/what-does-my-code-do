import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import { DEFAULT_CONFIG, type GraphSnapshot } from '@wdmcd/core';
import {
  buildImpactReport,
  createChangeEvent,
  graphDifference,
  parseGitRange,
} from '@wdmcd/impact';
import { applySemanticModel } from '@wdmcd/semantic-rules';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve('tests/.tmp/impact');

async function source(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function snapshot(commit: string, previous?: GraphSnapshot): Promise<GraphSnapshot> {
  const analysis = await analyzeTypescriptProject(root, DEFAULT_CONFIG);
  const project = await discoverProject(root, DEFAULT_CONFIG);
  project.scannedRef = commit === 'base123' ? 'main' : 'feature';
  project.commit = commit;
  const technical = buildTechnicalSnapshot({
    analysis,
    project,
    ...(previous ? { previous } : {}),
    scannedAt: commit === 'base123' ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
  });
  return applySemanticModel({
    snapshot: technical,
    capabilities: { capabilities: [] },
    questions: { questions: [] },
    ...(previous ? { previous } : {}),
  });
}

beforeEach(async () => {
  await rm(root, { recursive: true, force: true });
  await source('package.json', '{"name":"impact-app"}');
  await source(
    'tsconfig.json',
    '{"compilerOptions":{"module":"ESNext","moduleResolution":"Bundler"}}',
  );
  await source('src/billing/repository.ts', 'export const saveInvoice = (id: string) => id;\n');
  await source(
    'src/billing/service.ts',
    "import { saveInvoice } from './repository';\nexport const createInvoice = (id: string) => saveInvoice(id);\n",
  );
  await source(
    'src/billing/service.test.ts',
    "import { createInvoice } from './service';\ncreateInvoice('test');\n",
  );
  await source(
    'src/checkout/controller.ts',
    "import { createInvoice } from '../billing/service';\nexport const checkout = () => createInvoice('checkout');\n",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('change intelligence', () => {
  it('detects relation changes and evidence-backed downstream capabilities', async () => {
    const base = await snapshot('base123');
    await source('src/billing/service.ts', 'export const createInvoice = (id: string) => id;\n');
    const head = await snapshot('head456', base);
    const difference = graphDifference(base, head);
    const report = buildImpactReport({
      range: 'main...feature',
      baseRef: 'main',
      headRef: 'feature',
      base,
      head,
      files: [{ status: 'modified', path: 'src/billing/service.ts' }],
    });

    expect(difference.removedEdgeIds).toEqual(
      expect.arrayContaining([
        'imports:component:src/billing/service.ts->component:src/billing/repository.ts',
        'calls:component:src/billing/service.ts->component:src/billing/repository.ts',
      ]),
    );
    expect(report.direct.map((impact) => impact.name)).toContain('Billing');
    expect(report.downstream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Checkout', evidenceIds: expect.any(Array) }),
      ]),
    );
    expect(report.downstream[0]?.evidenceIds.length).toBeGreaterThan(0);
    expect(report.tests.map((test) => test.id)).toContain('test:src/billing/service.test.ts');
  });

  it('creates one readable event for a semantic model change', async () => {
    const base = await snapshot('base123');
    await source('src/billing/service.ts', 'export const createInvoice = (id: string) => id;\n');
    const head = await snapshot('head456', base);
    const event = createChangeEvent(base, head);

    expect(event).toMatchObject({ ref: 'feature', commit: 'head456' });
    expect(event?.capabilityIds).toContain('capability:billing');
    expect(event?.removedEdgeIds.length).toBeGreaterThan(0);
    expect(createChangeEvent(head, head)).toBeUndefined();
  });

  it('accepts only explicit three-dot Git ranges', () => {
    expect(parseGitRange('main...feature/invoices')).toEqual({
      range: 'main...feature/invoices',
      base: 'main',
      head: 'feature/invoices',
    });
    expect(parseGitRange('main...feature/team-audit').head).toBe('feature/team-audit');
    expect(() => parseGitRange('main..feature')).toThrow(/base\.\.\.head/);
    expect(() => parseGitRange('--help...main')).toThrow(/Invalid Git ref/);
  });
});
