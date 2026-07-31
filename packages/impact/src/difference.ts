import {
  GraphDifferenceSchema,
  stableStringify,
  type GraphDifference,
  type GraphNode,
  type GraphSnapshot,
} from '@wdmcd/core';

function changedIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  return after
    .filter((item) => {
      const previous = beforeById.get(item.id);
      return previous && stableStringify(previous) !== stableStringify(item);
    })
    .map((item) => item.id)
    .sort();
}

function comparableNode(node: GraphNode) {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    description: node.description,
    evidenceIds: node.evidenceIds,
    confidence: node.confidence,
    metadata: node.metadata,
  };
}

export function graphDifference(before: GraphSnapshot, after: GraphSnapshot): GraphDifference {
  const beforeNodeIds = new Set(before.nodes.map((node) => node.id));
  const afterNodeIds = new Set(after.nodes.map((node) => node.id));
  const beforeEdgeIds = new Set(before.edges.map((edge) => edge.id));
  const afterEdgeIds = new Set(after.edges.map((edge) => edge.id));

  return GraphDifferenceSchema.parse({
    addedNodeIds: [...afterNodeIds].filter((id) => !beforeNodeIds.has(id)).sort(),
    removedNodeIds: [...beforeNodeIds].filter((id) => !afterNodeIds.has(id)).sort(),
    changedNodeIds: changedIds(before.nodes.map(comparableNode), after.nodes.map(comparableNode)),
    addedEdgeIds: [...afterEdgeIds].filter((id) => !beforeEdgeIds.has(id)).sort(),
    removedEdgeIds: [...beforeEdgeIds].filter((id) => !afterEdgeIds.has(id)).sort(),
    changedEdgeIds: changedIds(before.edges, after.edges),
  });
}
