import {
  ImpactReportSchema,
  type ChangedFile,
  type GraphEdge,
  type GraphNode,
  type GraphSnapshot,
  type ImpactCapability,
  type ImpactReport,
} from '@wdmcd/core';

import { graphDifference } from './difference.js';

export interface BuildImpactOptions {
  range: string;
  baseRef: string;
  headRef: string;
  base: GraphSnapshot;
  head: GraphSnapshot;
  files: ChangedFile[];
}

function nodePath(node: GraphNode): string | undefined {
  const value = node.metadata?.path;
  return typeof value === 'string' ? value : undefined;
}

function memberships(snapshot: GraphSnapshot): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== 'implements') continue;
    const current = result.get(edge.to) ?? [];
    current.push(edge.from);
    result.set(edge.to, current);
  }
  return result;
}

function capabilityNode(snapshot: GraphSnapshot, id: string): GraphNode | undefined {
  return snapshot.nodes.find((node) => node.id === id && node.kind === 'capability');
}

function directImpacts(
  snapshots: GraphSnapshot[],
  changedPaths: Set<string>,
): { impacts: ImpactCapability[]; componentIds: Set<string>; capabilityIds: Set<string> } {
  const impacts = new Map<string, ImpactCapability>();
  const componentIds = new Set<string>();
  const capabilityIds = new Set<string>();
  for (const snapshot of snapshots) {
    const memberOf = memberships(snapshot);
    for (const node of snapshot.nodes) {
      const filePath = nodePath(node);
      if (!filePath || !changedPaths.has(filePath)) continue;
      componentIds.add(node.id);
      for (const capabilityId of memberOf.get(node.id) ?? []) {
        const capability = capabilityNode(snapshot, capabilityId);
        if (!capability) continue;
        capabilityIds.add(capabilityId);
        const existing = impacts.get(capabilityId);
        const ids = new Set(existing?.componentIds ?? []);
        ids.add(node.id);
        impacts.set(capabilityId, {
          capabilityId,
          name: capability.name,
          componentIds: [...ids].sort(),
          reason: `Changed files implement ${capability.name}.`,
          chain: [filePath, capability.name],
          evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), ...node.evidenceIds])],
        });
      }
    }
  }
  return {
    impacts: [...impacts.values()].sort((a, b) => a.name.localeCompare(b.name)),
    componentIds,
    capabilityIds,
  };
}

function downstreamImpacts(
  snapshot: GraphSnapshot,
  starts: Set<string>,
  excludedCapabilities: Set<string>,
): ImpactCapability[] {
  const memberOf = memberships(snapshot);
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const relevant = new Set(['calls', 'consumes', 'reads_from', 'writes_to', 'tested_by']);
  const results = new Map<string, ImpactCapability>();
  const queue = [...starts].map((id) => ({
    id,
    depth: 0,
    chain: [id],
    evidenceIds: [] as string[],
  }));
  const visited = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= 2) continue;
    const neighbors: Array<{ id: string; edge: GraphEdge }> = [];
    for (const edge of snapshot.edges) {
      if (!relevant.has(edge.kind)) continue;
      if (edge.kind === 'tested_by' && edge.from === current.id)
        neighbors.push({ id: edge.to, edge });
      else if (edge.to === current.id) neighbors.push({ id: edge.from, edge });
    }
    for (const neighbor of neighbors) {
      const depth = current.depth + 1;
      if ((visited.get(neighbor.id) ?? Number.POSITIVE_INFINITY) <= depth) continue;
      visited.set(neighbor.id, depth);
      const chain = [...current.chain, neighbor.id];
      const evidenceIds = [...new Set([...current.evidenceIds, ...neighbor.edge.evidenceIds])];
      for (const capabilityId of memberOf.get(neighbor.id) ?? []) {
        if (excludedCapabilities.has(capabilityId) || results.has(capabilityId)) continue;
        const capability = capabilityNode(snapshot, capabilityId);
        if (!capability || evidenceIds.length === 0) continue;
        const names = chain.map((id) => nodes.get(id)?.name ?? id);
        results.set(capabilityId, {
          capabilityId,
          name: capability.name,
          componentIds: [neighbor.id],
          reason: `${capability.name} is connected within ${depth} evidence-backed hop${depth === 1 ? '' : 's'}.`,
          chain: names,
          evidenceIds,
        });
      }
      queue.push({ id: neighbor.id, depth, chain, evidenceIds });
    }
  }
  return [...results.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function symbolsInFiles(snapshots: GraphSnapshot[], paths: Set<string>) {
  const result = new Map<string, Set<string>>();
  for (const snapshot of snapshots) {
    for (const node of snapshot.nodes) {
      const filePath = nodePath(node);
      if (!filePath || !paths.has(filePath)) continue;
      const symbols = node.metadata?.symbols;
      if (!Array.isArray(symbols)) continue;
      const names = result.get(filePath) ?? new Set<string>();
      for (const symbol of symbols) {
        if (symbol && typeof symbol === 'object' && 'name' in symbol)
          names.add(String(symbol.name));
      }
      result.set(filePath, names);
    }
  }
  return [...result.entries()]
    .map(([filePath, names]) => ({ path: filePath, names: [...names].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function buildImpactReport(options: BuildImpactOptions): ImpactReport {
  const changedPaths = new Set(
    options.files.flatMap((file) => [file.path, ...(file.oldPath ? [file.oldPath] : [])]),
  );
  const direct = directImpacts([options.base, options.head], changedPaths);
  const downstream = downstreamImpacts(options.head, direct.componentIds, direct.capabilityIds);
  const difference = graphDifference(options.base, options.head);
  const baseEdges = new Map(options.base.edges.map((edge) => [edge.id, edge]));
  const headEdges = new Map(options.head.edges.map((edge) => [edge.id, edge]));
  const tests = new Map<string, GraphNode>();
  for (const snapshot of [options.base, options.head]) {
    const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
    for (const edge of snapshot.edges) {
      if (edge.kind === 'tested_by' && direct.componentIds.has(edge.from)) {
        const test = nodes.get(edge.to);
        if (test) tests.set(test.id, test);
      }
    }
  }
  const questions: string[] = [];
  if (direct.impacts.length === 0)
    questions.push('No changed file maps to a known capability. Confirm the capability scope.');
  if (direct.componentIds.size > 0 && tests.size === 0) {
    questions.push(
      'No linked tests were found for the changed components. Confirm the intended coverage.',
    );
  }

  return ImpactReportSchema.parse({
    range: options.range,
    base: {
      ref: options.baseRef,
      commit: options.base.project.commit ?? 'unknown',
      snapshotId: options.base.id,
    },
    head: {
      ref: options.headRef,
      commit: options.head.project.commit ?? 'unknown',
      snapshotId: options.head.id,
    },
    files: options.files,
    symbols: symbolsInFiles([options.base, options.head], changedPaths),
    direct: direct.impacts,
    downstream,
    relations: {
      added: difference.addedEdgeIds
        .map((id) => headEdges.get(id))
        .filter((edge): edge is GraphEdge => Boolean(edge)),
      removed: difference.removedEdgeIds
        .map((id) => baseEdges.get(id))
        .filter((edge): edge is GraphEdge => Boolean(edge)),
      changed: difference.changedEdgeIds
        .map((id) => ({ before: baseEdges.get(id), after: headEdges.get(id) }))
        .filter((item): item is { before: GraphEdge; after: GraphEdge } =>
          Boolean(item.before && item.after),
        ),
    },
    tests: [...tests.values()],
    questions,
  });
}
