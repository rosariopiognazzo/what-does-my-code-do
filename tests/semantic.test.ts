import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import { DEFAULT_CONFIG, buildCapabilityDetail, buildOverview } from '@wdmcd/core';
import { applySemanticModel } from '@wdmcd/semantic-rules';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve('tests/.tmp/semantic');

async function source(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

beforeEach(async () => {
  await rm(root, { recursive: true, force: true });
  await source(
    'package.json',
    '{"name":"semantic-app","description":"Manage accounts and invoices."}',
  );
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
    'src/app/api/billing/route.ts',
    "import { createInvoice } from '../../../billing/service';\nexport async function POST() { return createInvoice('route'); }\n",
  );
  await source('src/auth/session.ts', 'export const loadSession = () => null;\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function technicalSnapshot() {
  const analysis = await analyzeTypescriptProject(root, DEFAULT_CONFIG);
  const project = await discoverProject(root, DEFAULT_CONFIG);
  project.scannedRef = 'main';
  project.commit = 'abc123';
  return buildTechnicalSnapshot({
    analysis,
    project,
    scannedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('semantic capability model', () => {
  it('infers domain capabilities and produces capability-first views', async () => {
    const snapshot = applySemanticModel({
      snapshot: await technicalSnapshot(),
      capabilities: { capabilities: [] },
      questions: { questions: [] },
    });
    const overview = buildOverview(snapshot);
    const billing = buildCapabilityDetail(snapshot, 'Billing');

    expect(overview.capabilities.map((capability) => capability.name)).toEqual(['Billing', 'Auth']);
    expect(billing.confidence).toBe('inferred');
    expect(billing.flows[0]?.steps[0]).toBe('POST /api/billing');
    expect(billing.components.tests).toHaveLength(1);
    expect(billing.evidence.some((item) => item.kind === 'inferred')).toBe(true);
  });

  it('gives curated scope precedence without losing technical relations', async () => {
    const snapshot = applySemanticModel({
      snapshot: await technicalSnapshot(),
      capabilities: {
        capabilities: [
          {
            id: 'capability:payments',
            name: 'Payments',
            description: 'Create and persist invoices.',
            confidence: 'confirmed',
            components: ['component:src/billing/service.ts'],
            evidence: [{ path: 'src/billing/service.ts', note: 'Confirmed by maintainer.' }],
          },
        ],
      },
      questions: {
        questions: [
          {
            id: 'question:payment-provider',
            question: 'Which payment provider owns retries?',
            capabilityId: 'capability:payments',
            evidenceIds: [],
            status: 'open',
          },
        ],
      },
    });
    const overview = buildOverview(snapshot, {
      questions: [
        {
          id: 'question:payment-provider',
          question: 'Which payment provider owns retries?',
          capabilityId: 'capability:payments',
          evidenceIds: [],
          status: 'open',
        },
      ],
    });
    const payments = buildCapabilityDetail(snapshot, 'capability:payments');

    expect(overview.capabilities.map((capability) => capability.name)).toEqual([
      'Payments',
      'Auth',
    ]);
    expect(payments.confidence).toBe('confirmed');
    expect(payments.components.data).toHaveLength(0);
    expect(snapshot.edges.some((edge) => edge.kind === 'calls')).toBe(true);
    expect(snapshot.edges).toContainEqual(
      expect.objectContaining({
        kind: 'risks',
        from: 'capability:payments',
        to: 'question:payment-provider',
      }),
    );
  });

  it('uses each workspace as a separate capability boundary', async () => {
    await source('apps/api/main.ts', "export const startApi = () => 'api';\n");
    await source('apps/dashboard/main.ts', "export const startDashboard = () => 'dashboard';\n");
    await source('packages/modules/orders/service.ts', 'export const createOrder = () => null;\n');

    const snapshot = applySemanticModel({
      snapshot: await technicalSnapshot(),
      capabilities: { capabilities: [] },
      questions: { questions: [] },
    });
    const names = buildOverview(snapshot).capabilities.map((capability) => capability.name);

    expect(names).toEqual(expect.arrayContaining(['Api', 'Dashboard', 'Orders']));
    expect(names).not.toContain('Apps');
    expect(names).not.toContain('Modules');
  });
});
