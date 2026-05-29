"use client";

import { useEffect, useMemo } from "react";
import { GitBranch } from "lucide-react";
import { Card } from "@heroui/react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import type { AgentActivityEdge, AgentActivityNode } from "@/lib/cockpit/adapter";
import { AgentActivityGraphLegend } from "./AgentActivityGraphLegend";
import { AgentActivityNodeCard } from "./AgentActivityNodeCard";
import { layoutActivityGraph } from "./activity-graph-layout";

const nodeTypes: NodeTypes = {
  agentActivity: AgentActivityNodeCard,
};

type AgentActivityGraphPanelProps = {
  nodes: AgentActivityNode[];
  edges: AgentActivityEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: AgentActivityGraphPanelProps) {
  const { fitView } = useReactFlow();
  const { flowNodes, flowEdges } = useMemo(() => layoutActivityGraph(nodes, edges), [nodes, edges]);

  const renderedNodes = useMemo(
    () =>
      flowNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [flowNodes, selectedNodeId],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, renderedNodes, flowEdges]);

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    onSelectNode(node.id);
  };

  return (
    <ReactFlow
      className="h-full w-full"
      nodes={renderedNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesReconnectable={false}
      nodesFocusable
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      minZoom={0.45}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background gap={16} size={1} color="var(--border)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

export function AgentActivityGraphPanel({ nodes, edges, selectedNodeId, onSelectNode }: AgentActivityGraphPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-3" aria-label={t("chat.activityPreview")}>
      <Card.Header className="mb-2 flex shrink-0 items-center gap-2 p-0">
        <GitBranch className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold">{t("chat.activityPreview")}</span>
      </Card.Header>
      <Card.Content className="min-h-0 flex-1 overflow-hidden p-0">
        <Card className="h-full min-h-[220px] border-border bg-background/40">
          <Card.Content className="h-full p-0 [&_.react-flow]:h-full">
            <ReactFlowProvider>
              <GraphCanvas nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
            </ReactFlowProvider>
          </Card.Content>
        </Card>
      </Card.Content>
      <AgentActivityGraphLegend />
    </Card>
  );
}
