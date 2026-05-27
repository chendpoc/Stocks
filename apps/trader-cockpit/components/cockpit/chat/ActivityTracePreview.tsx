"use client";

import { useMemo } from "react";
import { GitBranch, MoveRight } from "lucide-react";
import { Button, Card, Chip, ScrollShadow } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentActivityTrace } from "@/lib/cockpit/adapter";

type ActivityTracePreviewProps = {
  trace: AgentActivityTrace;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

function statusClass(status: string): string {
  if (status === "completed") {
    return "border-success/50 bg-success/10 text-success";
  }
  if (status === "warning") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (status === "failed") {
    return "border-danger/50 bg-danger/10 text-danger";
  }
  if (status === "running") {
    return "border-accent/50 bg-accent/10 text-accent";
  }
  return "border-border bg-background/70 text-muted";
}

export function ActivityTracePreview({ trace, selectedNodeId, onSelectNode }: ActivityTracePreviewProps) {
  const { t } = useTranslation();
  const incomingByTarget = useMemo(() => {
    const incoming = new Map<string, string[]>();

    for (const edge of trace.edges) {
      const existing = incoming.get(edge.target) ?? [];
      incoming.set(edge.target, [...existing, edge.source]);
    }

    return incoming;
  }, [trace.edges]);

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-3" aria-label={t("chat.activityPreview")}>
      <Card.Header className="mb-3 flex shrink-0 items-center gap-2 p-0">
        <GitBranch className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">{t("chat.activityPreview")}</h2>
      </Card.Header>
      <ScrollShadow className="min-h-0 flex-1 space-y-2 overflow-y-auto" hideScrollBar={false}>
        {trace.nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const incoming = incomingByTarget.get(node.id) ?? [];

          return (
            <Button
              key={node.id}
              type="button"
              variant="outline"
              fullWidth
              onClick={() => onSelectNode(node.id)}
              className={
                selected
                  ? "h-auto justify-start border-accent/70 bg-accent/10 p-3 text-left"
                  : "h-auto justify-start border-border bg-background/70 p-3 text-left hover:border-accent/40 hover:bg-surface-secondary"
              }
            >
              <span className="block min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" className={`border bg-transparent ${statusClass(node.status)}`}>
                      {t(`chat.nodeStatus.${node.status}`)}
                    </Chip>
                    <span className="text-[11px] uppercase tracking-wider text-muted">{t(`chat.nodeKinds.${node.kind}`)}</span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold">{node.title}</span>
                </span>
                <span className="text-[10px] tabular-nums text-muted">{node.createdAt}</span>
                </span>
              <span className="mt-2 block line-clamp-2 whitespace-normal text-xs leading-5 text-muted">{node.summary}</span>
              {incoming.length > 0 ? (
                <span className="mt-2 flex items-center gap-1 text-[10px] text-muted">
                  <span>{incoming.length}</span>
                  <MoveRight className="h-3 w-3" />
                  <span>{t("chat.traceInputs")}</span>
                </span>
              ) : null}
              </span>
            </Button>
          );
        })}
      </ScrollShadow>
    </Card>
  );
}
