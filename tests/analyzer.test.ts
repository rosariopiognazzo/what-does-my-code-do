import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  analyzeTypescriptProject,
  buildTechnicalSnapshot,
  discoverProject,
} from '@wdmcd/analyzer-ts';
import { DEFAULT_CONFIG } from '@wdmcd/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve('tests/.tmp/analyzer');

async function source(relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

beforeEach(async () => {
  await rm(root, { recursive: true, force: true });
  await source(
    'package.json',
    JSON.stringify({
      name: 'invoice-app',
      description: 'Create and persist invoices.',
      dependencies: { express: '^5.0.0' },
    }),
  );
  await source(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', strict: true },
    }),
  );
  await source(
    'src/billing/repository.ts',
    'export function saveInvoice(id: string) { return id; }\n',
  );
  await source(
    'src/billing/service.ts',
    "import { saveInvoice } from './repository';\nexport function createInvoice(id: string) { return saveInvoice(id); }\n",
  );
  await source(
    'src/billing/service.test.ts',
    "import { createInvoice } from './service';\ncreateInvoice('test');\n",
  );
  await source(
    'src/app/api/billing/route.ts',
    "import { createInvoice } from '../../../billing/service';\nexport async function POST() { return createInvoice('route'); }\n",
  );
  await source(
    'src/server.ts',
    "import express from 'express';\nconst app = express();\napp.post('/billing', () => 'ok');\n",
  );
  await source(
    'src/billing/billing.controller.ts',
    "import { Controller, Get } from '@nestjs/common';\n@Controller('billing')\nexport class BillingController {\n  @Get(':id')\n  getInvoice() { return 'ok'; }\n}\n",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('TypeScript analyzer', () => {
  it('reuses validated facts when source and configuration are unchanged', async () => {
    const first = await analyzeTypescriptProject(root, DEFAULT_CONFIG);
    const second = await analyzeTypescriptProject(root, DEFAULT_CONFIG);

    expect(first.cache).toEqual({ hit: false, files: 6 });
    expect(second.cache).toEqual({ hit: true, files: 6 });
    expect(second.files).toEqual(first.files);
  });

  it('extracts imports, calls, tests, and supported route patterns', async () => {
    const analysis = await analyzeTypescriptProject(root, DEFAULT_CONFIG);

    expect(analysis.files).toHaveLength(6);
    expect(
      analysis.files.find((file) => file.path.endsWith('service.ts'))?.imports[0],
    ).toMatchObject({
      specifier: './repository',
      resolvedPath: 'src/billing/repository.ts',
    });
    expect(analysis.files.find((file) => file.path.endsWith('service.ts'))?.calls[0]).toMatchObject(
      {
        callee: 'saveInvoice',
        resolvedPath: 'src/billing/repository.ts',
      },
    );
    expect(analysis.files.flatMap((file) => file.routes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          routePath: '/api/billing',
          framework: 'next-app',
        }),
        expect.objectContaining({ method: 'POST', routePath: '/billing', framework: 'express' }),
        expect.objectContaining({
          method: 'GET',
          routePath: '/billing/:id',
          framework: 'nest',
        }),
      ]),
    );
  });

  it('builds stable graph identities and explicit test evidence', async () => {
    const analysis = await analyzeTypescriptProject(root, DEFAULT_CONFIG);
    const project = await discoverProject(root, DEFAULT_CONFIG);
    project.scannedRef = 'main';
    project.commit = 'abc123';
    const first = buildTechnicalSnapshot({
      analysis,
      project,
      scannedAt: '2026-01-01T00:00:00.000Z',
    });
    const second = buildTechnicalSnapshot({
      analysis,
      project,
      previous: first,
      scannedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.id).toBe(first.id);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.edges).toEqual(first.edges);
    expect(second.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tested_by',
          from: 'component:src/billing/service.ts',
          to: 'test:src/billing/service.test.ts',
        }),
        expect.objectContaining({
          kind: 'calls',
          from: 'component:src/billing/service.ts',
          to: 'component:src/billing/repository.ts',
        }),
      ]),
    );
  });
});
