"use client";

import { Card, Chip } from "@heroui/react";
import type { Node, NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import type { ActivityFlowNodeData } from "./activity-graph-types";
import { nodeStatusChipClass, selectedGraphNodeCardClass } from "./activity-graph-styles";

export function AgentActivityNodeCard({ data, selected }: NodeProps<Node<ActivityFlowNodeData>>) {
  const { t } = useTranslation();
  const { node } = data;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-border !bg-muted" isConnectable={false} />
      <Card className={selectedGraphNodeCardClass(Boolean(selected))}>
        <Card.Header className="flex flex-wrap items-center gap-2 p-3 pb-0">
          <Chip size="sm" className={`border bg-transparent ${nodeStatusChipClass(node.status)}`}>
            {t(`chat.nodeStatus.${node.status}`)}
          </Chip>
          <Chip size="sm" className="border border-border bg-transparent uppercase text-muted">
            {t(`chat.nodeKinds.${node.kind}`)}
          </Chip>
        </Card.Header>
        <Card.Content className="block min-w-0 p-3 pt-2">
          <span className="block line-clamp-1 text-sm font-semibold">{node.title}</span>
          <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted">{node.summary}</span>
        </Card.Content>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-border !bg-muted" isConnectable={false} />
    </>
  );
}
