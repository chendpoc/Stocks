import type { Edge, Node } from "@xyflow/react";
import type { AgentActivityEdge, AgentActivityNode } from "@/lib/cockpit/adapter";
import type { ActivityFlowNodeData } from "./activity-graph-types";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 96;
const HORIZONTAL_GAP = 56;
const VERTICAL_GAP = 80;

function computeLayers(nodeIds: Set<string>, edges: AgentActivityEdge[]): Map<string, number> {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const layers = new Map<string, number>();
  const queue = [...nodeIds].filter((id) => (inDegree.get(id) ?? 0) === 0);

  if (queue.length === 0 && nodeIds.size > 0) {
    queue.push([...nodeIds][0]);
  }

  for (const id of queue) {
    layers.set(id, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    const currentLayer = layers.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      const nextLayer = Math.max(currentLayer + 1, layers.get(next) ?? 0);
      layers.set(next, nextLayer);
      if (!queue.includes(next)) {
        queue.push(next);
      }
    }
  }

  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  return layers;
}

export function layoutActivityGraph(
  nodes: AgentActivityNode[],
  edges: AgentActivityEdge[],
): { flowNodes: Node<ActivityFlowNodeData>[]; flowEdges: Edge[] } {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const layers = computeLayers(nodeIds, edges);
  const nodesByLayer = new Map<number, AgentActivityNode[]>();

  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const bucket = nodesByLayer.get(layer) ?? [];
    bucket.push(node);
    nodesByLayer.set(layer, bucket);
  }

  const sortedLayers = [...nodesByLayer.keys()].sort((a, b) => a - b);
  const maxLayerWidth = Math.max(...sortedLayers.map((layer) => nodesByLayer.get(layer)?.length ?? 0), 1);

  const flowNodes: Node<ActivityFlowNodeData>[] = [];

  for (const layer of sortedLayers) {
    const layerNodes = nodesByLayer.get(layer) ?? [];
    const layerWidth = layerNodes.length;
    const totalWidth = layerWidth * NODE_WIDTH + Math.max(layerWidth - 1, 0) * HORIZONTAL_GAP;
    const maxWidth = maxLayerWidth * NODE_WIDTH + Math.max(maxLayerWidth - 1, 0) * HORIZONTAL_GAP;
    const offsetX = (maxWidth - totalWidth) / 2;

    layerNodes.forEach((node, index) => {
      flowNodes.push({
        id: node.id,
        type: "agentActivity",
        position: {
          x: offsetX + index * (NODE_WIDTH + HORIZONTAL_GAP),
          y: layer * (NODE_HEIGHT + VERTICAL_GAP),
        },
        data: { node },
        draggable: false,
        selectable: true,
        connectable: false,
      });
    });
  }

  const flowEdges: Edge[] = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: "smoothstep",
      animated: false,
      selectable: false,
      focusable: false,
    }));

  return { flowNodes, flowEdges };
}

export const activityGraphLayoutMetrics = {
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
};
