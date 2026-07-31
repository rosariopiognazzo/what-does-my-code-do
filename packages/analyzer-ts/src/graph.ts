import path from 'node:path';

import {
  GraphSnapshotSchema,
  contentHash,
  normalizeProjectPath,
  shortHash,
  stableNodeId,
  stableStringify,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
  type ProjectContext,
  type SourceFileFact,
  type TechnicalAnalysis,
} from '@wdmcd/core';

export interface BuildSnapshotOptions {
  analysis: TechnicalAnalysis;
  project: ProjectContext;
  previous?: GraphSnapshot;
  scannedAt?: string;
}

function componentId(file: SourceFileFact): string {
  return stableNodeId(file.isTest ? 'test' : 'component', file.path);
}

function evidenceId(kind: string, value: string): string {
  return `evidence:${kind}:${shortHash(value)}`;
}

function nodeTimes(
  candidate: Omit<GraphNode, 'createdAt' | 'updatedAt'>,
  previous: GraphNode | undefined,
  scannedAt: string,
): Pick<GraphNode, 'createdAt' | 'updatedAt'> {
  if (!previous) return { createdAt: scannedAt, updatedAt: scannedAt };
  const previousContent = { ...previous, createdAt: undefined, updatedAt: undefined };
  const candidateContent = { ...candidate, createdAt: undefined, updatedAt: undefined };
  return {
    createdAt: previous.createdAt,
    updatedAt:
      stableStringify(previousContent) === stableStringify(candidateContent)
        ? previous.updatedAt
        : scannedAt,
  };
}

function addEdge(edges: Map<string, GraphEdge>, edge: GraphEdge): void {
  const existing = edges.get(edge.id);
  if (!existing) {
    edges.set(edge.id, edge);
    return;
  }
  existing.evidenceIds = [...new Set([...existing.evidenceIds, ...edge.evidenceIds])].sort();
}

export function buildTechnicalSnapshot(options: BuildSnapshotOptions): GraphSnapshot {
  const scannedAt = options.scannedAt ?? new Date().toISOString();
  const previousNodes = new Map(options.previous?.nodes.map((node) => [node.id, node]));
  const nodes: GraphNode[] = [];
  const edges = new Map<string, GraphEdge>();
  const evidence: Evidence[] = [];
  const files = new Map(options.analysis.files.map((file) => [file.path, file]));

  const packageEvidence: Evidence = {
    id: 'evidence:file:package-json',
    kind: 'observed',
    sourceType: 'file',
    path: 'package.json',
    note: 'Project identity and declared dependencies.',
  };
  evidence.push(packageEvidence);
  const projectCandidate: Omit<GraphNode, 'createdAt' | 'updatedAt'> = {
    id: options.project.id,
    kind: 'project',
    name: options.project.name,
    ...(options.project.purpose ? { description: options.project.purpose } : {}),
    evidenceIds: [packageEvidence.id],
    confidence: 'observed',
    metadata: {
      frameworks: options.project.frameworks,
      dependencies: options.analysis.dependencies,
      sourceRoots: options.project.sourceRoots,
    },
  };
  nodes.push({
    ...projectCandidate,
    ...nodeTimes(projectCandidate, previousNodes.get(projectCandidate.id), scannedAt),
  });

  for (const file of options.analysis.files) {
    const fileEvidence: Evidence = {
      id: evidenceId('file', file.path),
      kind: 'observed',
      sourceType: 'file',
      path: file.path,
    };
    evidence.push(fileEvidence);
    const exportedSymbols = file.symbols.filter((symbol) => symbol.exported);
    const primaryName = exportedSymbols.length === 1 ? exportedSymbols[0]?.name : undefined;
    const candidate: Omit<GraphNode, 'createdAt' | 'updatedAt'> = {
      id: componentId(file),
      kind: file.isTest ? 'test' : 'component',
      name: primaryName ?? path.basename(file.path).replace(/\.[^.]+$/, ''),
      evidenceIds: [fileEvidence.id],
      confidence: 'observed',
      metadata: {
        path: file.path,
        hash: file.hash,
        symbols: file.symbols,
      },
    };
    nodes.push({
      ...candidate,
      ...nodeTimes(candidate, previousNodes.get(candidate.id), scannedAt),
    });

    for (const route of file.routes) {
      const routeEvidence: Evidence = {
        id: evidenceId(
          'route',
          `${route.sourcePath}:${route.line}:${route.method}:${route.routePath}`,
        ),
        kind: 'observed',
        sourceType: 'symbol',
        path: route.sourcePath,
        lineStart: route.line,
        lineEnd: route.line,
        ...(route.handler ? { symbol: route.handler } : {}),
        note: `${route.framework} route pattern.`,
      };
      evidence.push(routeEvidence);
      const routeId = stableNodeId('route', route.sourcePath, `${route.method}:${route.routePath}`);
      const routeCandidate: Omit<GraphNode, 'createdAt' | 'updatedAt'> = {
        id: routeId,
        kind: 'route',
        name: `${route.method} ${route.routePath}`,
        evidenceIds: [routeEvidence.id],
        confidence: 'observed',
        metadata: { method: route.method, path: route.routePath, framework: route.framework },
      };
      nodes.push({
        ...routeCandidate,
        ...nodeTimes(routeCandidate, previousNodes.get(routeCandidate.id), scannedAt),
      });
      addEdge(edges, {
        id: `exposes:${candidate.id}->${routeId}`,
        kind: 'exposes',
        from: candidate.id,
        to: routeId,
        evidenceIds: [routeEvidence.id],
        confidence: 'observed',
      });
    }
  }

  for (const file of options.analysis.files) {
    const fromId = componentId(file);
    for (const imported of file.imports) {
      if (!imported.resolvedPath) continue;
      const targetFile = files.get(normalizeProjectPath(imported.resolvedPath));
      if (!targetFile) continue;
      const toId = componentId(targetFile);
      const importEvidence: Evidence = {
        id: evidenceId('import', `${file.path}:${imported.line}:${imported.specifier}`),
        kind: 'observed',
        sourceType: 'symbol',
        path: file.path,
        lineStart: imported.line,
        lineEnd: imported.line,
        note: `Imports ${imported.specifier}.`,
      };
      evidence.push(importEvidence);
      addEdge(edges, {
        id: `imports:${fromId}->${toId}`,
        kind: 'imports',
        from: fromId,
        to: toId,
        evidenceIds: [importEvidence.id],
        confidence: 'observed',
      });
      if (file.isTest && !targetFile.isTest) {
        addEdge(edges, {
          id: `tested_by:${toId}->${fromId}`,
          kind: 'tested_by',
          from: toId,
          to: fromId,
          evidenceIds: [importEvidence.id],
          confidence: 'observed',
        });
      }
    }

    for (const call of file.calls) {
      if (!call.resolvedPath) continue;
      const targetFile = files.get(normalizeProjectPath(call.resolvedPath));
      if (!targetFile) continue;
      const toId = componentId(targetFile);
      const callEvidence: Evidence = {
        id: evidenceId('call', `${file.path}:${call.line}:${call.callee}:${call.resolvedPath}`),
        kind: 'observed',
        sourceType: 'symbol',
        path: file.path,
        symbol: call.callee,
        lineStart: call.line,
        lineEnd: call.line,
        note: `Calls ${call.callee}.`,
      };
      evidence.push(callEvidence);
      addEdge(edges, {
        id: `calls:${fromId}->${toId}`,
        kind: 'calls',
        from: fromId,
        to: toId,
        evidenceIds: [callEvidence.id],
        confidence: 'observed',
      });
    }
  }

  const uniqueEvidence = [...new Map(evidence.map((item) => [item.id, item])).values()].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  nodes.sort((left, right) => left.id.localeCompare(right.id));
  const sortedEdges = [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  const graphContent = {
    project: options.project,
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      ...(node.description ? { description: node.description } : {}),
      evidenceIds: node.evidenceIds,
      confidence: node.confidence,
      ...(node.metadata ? { metadata: node.metadata } : {}),
    })),
    edges: sortedEdges,
    evidence: uniqueEvidence,
    diagnostics: options.analysis.diagnostics,
  };
  const hash = contentHash(graphContent);

  return GraphSnapshotSchema.parse({
    modelVersion: 1,
    id: `snapshot:${hash.slice(0, 16)}`,
    project: options.project,
    scannedAt,
    contentHash: hash,
    nodes,
    edges: sortedEdges,
    evidence: uniqueEvidence,
    diagnostics: options.analysis.diagnostics,
    stats: {
      files: options.analysis.files.length,
      nodes: nodes.length,
      edges: sortedEdges.length,
      capabilities: nodes.filter((node) => node.kind === 'capability').length,
      tests: nodes.filter((node) => node.kind === 'test').length,
    },
  });
}
