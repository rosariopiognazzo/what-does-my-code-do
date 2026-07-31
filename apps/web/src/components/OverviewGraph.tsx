import type { CapabilitySummary } from '@wdmcd/core';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { useNavigate } from 'react-router-dom';

export function OverviewGraph({
  project,
  capabilities,
}: {
  project: string;
  capabilities: CapabilitySummary[];
}) {
  const navigate = useNavigate();
  const visible = capabilities.slice(0, 10);
  const nodes: Node[] = [
    {
      id: 'project',
      position: { x: 30, y: 185 },
      data: { label: project },
      style: { background: '#171b18', color: '#fff', border: '1px solid #171b18', width: 170 },
    },
    ...visible.map((capability, index) => ({
      id: capability.id,
      position: { x: 310 + (index % 3) * 230, y: 40 + Math.floor(index / 3) * 125 },
      data: { label: capability.name },
      style: {
        background: '#fff',
        color: '#171b18',
        border: `1px solid ${capability.confidence === 'inferred' ? '#c98b2e' : '#2d7b5a'}`,
        width: 180,
      },
    })),
  ];
  const edges: Edge[] = visible.map((capability) => ({
    id: `project-${capability.id}`,
    source: 'project',
    target: capability.id,
    type: 'straight',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#7c857f' },
    style: { stroke: '#7c857f' },
  }));

  return (
    <div className="graph-canvas overview-graph" aria-label="Project capability graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.45}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          if (node.id !== 'project') navigate(`/capabilities/${encodeURIComponent(node.id)}`);
        }}
      >
        <Background color="#d9ddd9" gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
