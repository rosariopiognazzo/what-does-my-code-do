import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import { applySemanticModel } from '@wdmcd/semantic-rules';
import { initializeProject, persistSnapshot, readCapabilities, readConfig } from '@wdmcd/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createLocalApp } from '../packages/cli/src/server.js';

const root = path.resolve('tests/.tmp/api');
const assets = path.join(root, 'web');

async function source(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

beforeEach(async () => {
  await rm(root, { recursive: true, force: true });
  await mkdir(path.join(root, '.git'), { recursive: true });
  await source('package.json', '{"name":"api-app","description":"Manage invoices."}');
  await source('src/billing/service.ts', 'export const createInvoice = () => true;\n');
  await source('src/reporting/service.ts', 'export const createReport = () => true;\n');
  await source('web/index.html', '<div id="root">WDMCD test</div>');
  await source('web/assets/app.js', 'console.log("test");');
  await initializeProject(root);
  const config = await readConfig(root);
  const analysis = await analyzeTypescriptProject(root, config);
  const project = await discoverProject(root, config);
  project.scannedRef = 'main';
  project.commit = 'abc123';
  const technical = buildTechnicalSnapshot({
    analysis,
    project,
    scannedAt: '2026-01-01T00:00:00.000Z',
  });
  const snapshot = applySemanticModel({
    snapshot: technical,
    capabilities: { capabilities: [] },
    questions: { questions: [] },
  });
  await persistSnapshot(root, snapshot);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('local HTTP API', () => {
  it('serves shared overview, capability, source, and SPA contracts', async () => {
    const app = createLocalApp({ root, assetsRoot: assets, rescan: async () => undefined });
    const overview = await app.request('/api/project');
    const body = (await overview.json()) as { capabilities: Array<{ id: string }> };
    const capabilityId = body.capabilities[0]?.id;

    expect(overview.status).toBe(200);
    expect(capabilityId).toBe('capability:billing');
    const detail = await app.request(`/api/capabilities/${encodeURIComponent(capabilityId ?? '')}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ name: 'Billing', confidence: 'inferred' });

    const sourceResponse = await app.request('/api/source?path=src%2Fbilling%2Fservice.ts&line=1');
    expect(await sourceResponse.text()).toContain('createInvoice');
    expect((await app.request('/api/source?path=..%2Fsecret.txt')).status).toBe(404);
    expect((await app.request('/assets/app.js')).headers.get('content-type')).toContain(
      'text/javascript',
    );
    expect(await (await app.request('/capabilities/capability%3Abilling')).text()).toContain(
      'WDMCD test',
    );
  });

  it('confirms an inferred capability in the curated YAML contract', async () => {
    const app = createLocalApp({ root, assetsRoot: assets, rescan: async () => undefined });
    const response = await app.request('/api/capabilities/capability%3Abilling/confirm', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      file: '.wdmcd/capabilities.yaml',
      rescanned: true,
    });
    expect(await readCapabilities(root)).toMatchObject({
      capabilities: [
        {
          id: 'capability:billing',
          confidence: 'confirmed',
          components: ['component:src/billing/service.ts'],
        },
      ],
    });
  });

  it('searches components and persists an explicit capability correction', async () => {
    const app = createLocalApp({ root, assetsRoot: assets, rescan: async () => undefined });
    const components = await app.request('/api/components?query=reporting');

    expect(components.status).toBe(200);
    expect(await components.json()).toEqual([
      expect.objectContaining({
        id: 'component:src/reporting/service.ts',
        path: 'src/reporting/service.ts',
      }),
    ]);

    const response = await app.request('/api/capabilities/capability%3Abilling/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Invoice management',
        description: 'Create invoices and reporting output.',
        components: ['component:src/reporting/service.ts'],
      }),
    });

    expect(response.status).toBe(200);
    expect(await readCapabilities(root)).toMatchObject({
      capabilities: [
        {
          id: 'capability:billing',
          name: 'Invoice management',
          description: 'Create invoices and reporting output.',
          confidence: 'confirmed',
          components: ['component:src/reporting/service.ts'],
        },
      ],
    });
  });
});
