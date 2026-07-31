import { ChangeEventSchema, shortHash, type ChangeEvent, type GraphSnapshot } from '@wdmcd/core';

import { graphDifference } from './difference.js';

function capabilityMembership(snapshot: GraphSnapshot): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const edge of snapshot.edges) {
    if (edge.kind !== 'implements') continue;
    const capabilities = result.get(edge.to) ?? new Set<string>();
    capabilities.add(edge.from);
    result.set(edge.to, capabilities);
  }
  return result;
}

export function createChangeEvent(
  before: GraphSnapshot | undefined,
  after: GraphSnapshot,
): ChangeEvent | undefined {
  if (!before) {
    return ChangeEventSchema.parse({
      id: `change:initial:${shortHash(after.id)}`,
      occurredAt: after.scannedAt,
      snapshotId: after.id,
      ...(after.project.scannedRef ? { ref: after.project.scannedRef } : {}),
      ...(after.project.commit ? { commit: after.project.commit } : {}),
      summary: `Initial model with ${after.stats.capabilities} capabilities and ${after.stats.files} files.`,
      capabilityIds: after.nodes
        .filter((node) => node.kind === 'capability')
        .map((node) => node.id),
      addedNodeIds: after.nodes.map((node) => node.id),
      removedNodeIds: [],
      changedNodeIds: [],
      addedEdgeIds: after.edges.map((edge) => edge.id),
      removedEdgeIds: [],
      changedEdgeIds: [],
    });
  }
  if (before.contentHash === after.contentHash) return undefined;

  const difference = graphDifference(before, after);
  const beforeMembership = capabilityMembership(before);
  const afterMembership = capabilityMembership(after);
  const affectedNodeIds = new Set([
    ...difference.addedNodeIds,
    ...difference.removedNodeIds,
    ...difference.changedNodeIds,
  ]);
  for (const edgeId of [
    ...difference.addedEdgeIds,
    ...difference.removedEdgeIds,
    ...difference.changedEdgeIds,
  ]) {
    const edge =
      after.edges.find((item) => item.id === edgeId) ??
      before.edges.find((item) => item.id === edgeId);
    if (edge) {
      affectedNodeIds.add(edge.from);
      affectedNodeIds.add(edge.to);
    }
  }
  const capabilityIds = new Set<string>();
  for (const nodeId of affectedNodeIds) {
    for (const id of beforeMembership.get(nodeId) ?? []) capabilityIds.add(id);
    for (const id of afterMembership.get(nodeId) ?? []) capabilityIds.add(id);
    if (nodeId.startsWith('capability:')) capabilityIds.add(nodeId);
  }

  const relationChanges =
    difference.addedEdgeIds.length +
    difference.removedEdgeIds.length +
    difference.changedEdgeIds.length;
  return ChangeEventSchema.parse({
    id: `change:${shortHash(`${before.id}->${after.id}`)}`,
    occurredAt: after.scannedAt,
    snapshotId: after.id,
    ...(after.project.scannedRef ? { ref: after.project.scannedRef } : {}),
    ...(after.project.commit ? { commit: after.project.commit } : {}),
    summary: `${affectedNodeIds.size} graph nodes and ${relationChanges} relations changed.`,
    capabilityIds: [...capabilityIds].sort(),
    ...difference,
  });
}
