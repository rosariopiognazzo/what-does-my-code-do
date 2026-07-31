import type { CapabilityDetail, GraphNode } from '@wdmcd/core';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';

function graphNodes(detail: CapabilityDetail): Node[] {
  const groups: Array<[GraphNode[], number]> = [
    [detail.components.entry, 20],
    [detail.components.orchestration, 260],
    [detail.components.data, 500],
    [detail.components.integrations, 500],
    [detail.components.tests, 740],
    [detail.components.other, 260],
  ];
  const nodes: Node[] = [];
  const offsets = new Map<number, number>();
  for (const [items, x] of groups) {
    for (const item of items) {
      const index = offsets.get(x) ?? 0;
      offsets.set(x, index + 1);
      nodes.push({
        id: item.id,
        position: { x, y: 35 + index * 100 },
        data: { label: item.name },
        style: {
          width: 190,
          background: item.kind === 'route' ? '#e8f3ef' : item.kind === 'test' ? '#edf2fb' : '#fff',
          border: `1px solid ${item.kind === 'route' ? '#2d7b5a' : item.kind === 'test' ? '#5178b8' : '#aab1ac'}`,
          color: '#171b18',
        },
      });
    }
  }
  return nodes;
}

export function CapabilityGraph({ detail }: { detail: CapabilityDetail }) {
  const nodeIds = new Set(graphNodes(detail).map((node) => node.id));
  const preferredRelations = detail.relations.filter((edge) => {
    if (edge.kind !== 'imports') return true;
    const strongerSameDirection = detail.relations.some(
      (candidate) =>
        candidate.from === edge.from && candidate.to === edge.to && candidate.kind === 'calls',
    );
    const explicitTestRelation = detail.relations.some(
      (candidate) =>
        candidate.from === edge.to && candidate.to === edge.from && candidate.kind === 'tested_by',
    );
    return !strongerSameDirection && !explicitTestRelation;
  });
  const edges: Edge[] = preferredRelations
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      label: edge.kind,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#717a74' },
      style: { stroke: '#717a74' },
      labelStyle: { fill: '#4f5752', fontSize: 11 },
    }));

  return (
    <div className="graph-canvas capability-graph" aria-label={`${detail.name} component graph`}>
      <ReactFlow
        nodes={graphNodes(detail)}
        edges={edges}
        fitView
        minZoom={0.45}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#d9ddd9" gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
