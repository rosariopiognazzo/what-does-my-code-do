import type { CapabilityDetail, GraphNode } from '@wdmcd/core';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';

const MAX_GRAPH_NODES = 60;

function visibleMembers(detail: CapabilityDetail): Set<string> {
  const groups = Object.values(detail.components);
  const members = groups.flat();
  const memberIds = new Set(members.map((member) => member.id));
  const adjacent = new Map<string, string[]>();
  for (const edge of detail.relations) {
    if (!memberIds.has(edge.from) || !memberIds.has(edge.to)) continue;
    adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), edge.to]);
    adjacent.set(edge.to, [...(adjacent.get(edge.to) ?? []), edge.from]);
  }
  const seeds = [
    ...detail.components.entry,
    ...detail.components.orchestration.slice(0, 12),
    ...detail.components.data.slice(0, 6),
    ...detail.components.integrations.slice(0, 6),
  ];
  if (seeds.length === 0) seeds.push(...members.slice(0, 12));

  const selected = new Set<string>();
  const queue = seeds.map((node) => node.id);
  while (queue.length > 0 && selected.size < MAX_GRAPH_NODES) {
    const current = queue.shift();
    if (!current || selected.has(current)) continue;
    selected.add(current);
    for (const neighbor of adjacent.get(current) ?? []) {
      if (!selected.has(neighbor)) queue.push(neighbor);
    }
  }
  for (const member of members) {
    if (selected.size >= MAX_GRAPH_NODES) break;
    selected.add(member.id);
  }
  return selected;
}

function graphNodes(detail: CapabilityDetail): Node[] {
  const visible = visibleMembers(detail);
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
    for (const item of items.filter((candidate) => visible.has(candidate.id))) {
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
  const nodes = graphNodes(detail);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const totalNodes = Object.values(detail.components).reduce(
    (total, group) => total + group.length,
    0,
  );
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
    <div className="graph-frame">
      <span className="graph-count">
        {nodes.length} of {totalNodes} components
      </span>
      <div className="graph-canvas capability-graph" aria-label={`${detail.name} component graph`}>
        <ReactFlow
          nodes={nodes}
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
    </div>
  );
}
