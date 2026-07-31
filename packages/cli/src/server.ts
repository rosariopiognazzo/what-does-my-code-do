import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { buildCapabilityDetail, buildOverview, errorMessage, WdmcdError } from '@wdmcd/core';
import { loadImpactReport } from '@wdmcd/impact';
import {
  confirmCapability,
  readChangeEvents,
  readLatestSnapshot,
  readOpenQuestions,
} from '@wdmcd/store';
import { Hono } from 'hono';

import { scanProject } from './scan.js';

export interface LocalAppOptions {
  root: string;
  assetsRoot?: string;
  rescan?: () => Promise<void>;
}

const DEFAULT_ASSETS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web/dist',
);

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.woff2') return 'font/woff2';
  return 'application/octet-stream';
}

async function requireSnapshot(root: string) {
  const snapshot = await readLatestSnapshot(root);
  if (!snapshot)
    throw new WdmcdError('SNAPSHOT_NOT_FOUND', 'No snapshot found. Run wdmcd scan first.');
  return snapshot;
}

export function createLocalApp(options: LocalAppOptions): Hono {
  const root = path.resolve(options.root);
  const assetsRoot = path.resolve(options.assetsRoot ?? DEFAULT_ASSETS);
  const app = new Hono();

  app.get('/api/project', async (context) => {
    const [snapshot, questions] = await Promise.all([
      requireSnapshot(root),
      readOpenQuestions(root),
    ]);
    return context.json(buildOverview(snapshot, questions));
  });

  app.get('/api/capabilities', async (context) => {
    const [snapshot, questions] = await Promise.all([
      requireSnapshot(root),
      readOpenQuestions(root),
    ]);
    return context.json(buildOverview(snapshot, questions).capabilities);
  });

  app.get('/api/capabilities/:id', async (context) => {
    const [snapshot, history] = await Promise.all([requireSnapshot(root), readChangeEvents(root)]);
    return context.json(buildCapabilityDetail(snapshot, context.req.param('id'), history));
  });

  app.get('/api/components/:id', async (context) => {
    const snapshot = await requireSnapshot(root);
    const id = context.req.param('id');
    const node = snapshot.nodes.find((item) => item.id === id);
    if (!node) throw new WdmcdError('COMPONENT_NOT_FOUND', `Component not found: ${id}.`);
    const relations = snapshot.edges.filter((edge) => edge.from === id || edge.to === id);
    const evidenceIds = new Set([
      ...node.evidenceIds,
      ...relations.flatMap((edge) => edge.evidenceIds),
    ]);
    return context.json({
      node,
      relations,
      evidence: snapshot.evidence.filter((item) => evidenceIds.has(item.id)),
      capabilityIds: snapshot.edges
        .filter((edge) => edge.kind === 'implements' && edge.to === id)
        .map((edge) => edge.from),
    });
  });

  app.get('/api/source', async (context) => {
    const sourcePath = context.req.query('path');
    if (!sourcePath) throw new WdmcdError('SOURCE_NOT_FOUND', 'A source path is required.');
    const target = path.resolve(root, sourcePath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new WdmcdError('SOURCE_NOT_FOUND', 'Source path is outside the project root.');
    }
    try {
      const content = await readFile(target, 'utf8');
      const requestedLine = Number.parseInt(context.req.query('line') ?? '', 10);
      if (!Number.isInteger(requestedLine) || requestedLine < 1) {
        return context.text(content, 200, { 'content-type': 'text/plain; charset=utf-8' });
      }
      const lines = content.split(/\r?\n/);
      const start = Math.max(0, requestedLine - 11);
      const end = Math.min(lines.length, requestedLine + 10);
      const width = String(end).length;
      const excerpt = lines
        .slice(start, end)
        .map((line, index) => `${String(start + index + 1).padStart(width)} | ${line}`)
        .join('\n');
      return context.text(excerpt, 200, { 'content-type': 'text/plain; charset=utf-8' });
    } catch {
      throw new WdmcdError('SOURCE_NOT_FOUND', `Source file not found: ${sourcePath}.`);
    }
  });

  app.get('/api/impact', async (context) => {
    const base = context.req.query('base');
    const head = context.req.query('head');
    if (!base || !head)
      throw new WdmcdError('INVALID_GIT_RANGE', 'Both base and head are required.');
    return context.json(await loadImpactReport(root, `${base}...${head}`));
  });

  app.post('/api/capabilities/:id/confirm', async (context) => {
    const snapshot = await requireSnapshot(root);
    const capability = await confirmCapability(root, snapshot, context.req.param('id'));
    if (options.rescan) await options.rescan();
    else await scanProject(root);
    return context.json({
      capability,
      file: '.wdmcd/capabilities.yaml',
      rescanned: true,
    });
  });

  app.get('/assets/*', async (context) => {
    const relativePath = context.req.path.replace(/^\//, '');
    const target = path.resolve(assetsRoot, relativePath);
    if (!target.startsWith(`${assetsRoot}${path.sep}`)) return context.notFound();
    try {
      const content = await readFile(target);
      return new Response(content, { headers: { 'content-type': contentType(target) } });
    } catch {
      return context.notFound();
    }
  });

  app.get('*', async (context) => {
    try {
      return context.html(await readFile(path.join(assetsRoot, 'index.html'), 'utf8'));
    } catch {
      throw new WdmcdError('WEB_ASSETS_NOT_FOUND', 'Web assets are missing. Run pnpm build:web.');
    }
  });

  app.onError((error, context) => {
    const status = error instanceof WdmcdError && error.code.endsWith('NOT_FOUND') ? 404 : 400;
    return context.json(
      {
        error: error instanceof WdmcdError ? error.code : 'INTERNAL_ERROR',
        message: errorMessage(error),
        details: error instanceof WdmcdError ? error.details : [],
      },
      status,
    );
  });

  return app;
}

async function availablePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 20; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new WdmcdError(
    'PORT_UNAVAILABLE',
    `No local port available from ${preferred} to ${preferred + 19}.`,
  );
}

export async function startLocalServer(
  root: string,
  preferredPort = 4317,
): Promise<{ url: string; close: () => Promise<void> }> {
  const port = await availablePort(preferredPort);
  const app = createLocalApp({ root });
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
