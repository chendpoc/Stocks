"use client";

import type { KeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Clock3, Loader2, Route } from "lucide-react";
import { Card, Chip, ScrollShadow } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentActivityNode } from "@/lib/cockpit/adapter";

type ActivityChainPanelProps = {
  nodes: AgentActivityNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

function statusChipClass(status: AgentActivityNode["status"]): string {
  if (status === "completed") {
    return "border-success/50 bg-success/10 text-success";
  }
  if (status === "running") {
    return "border-accent/50 bg-accent/10 text-accent";
  }
  if (status === "warning") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (status === "failed") {
    return "border-danger/50 bg-danger/10 text-danger";
  }
  return "border-border bg-background/70 text-muted";
}

function statusIcon(status: AgentActivityNode["status"]) {
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (status === "running") {
    return <Loader2 className="h-4 w-4 text-accent" />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-4 w-4 text-warning" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-4 w-4 text-danger" />;
  }
  return <Clock3 className="h-4 w-4 text-muted" />;
}

export function ActivityChainPanel({ nodes, selectedNodeId, onSelectNode }: ActivityChainPanelProps) {
  const { t } = useTranslation();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, nodeId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectNode(nodeId);
  }

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-3" aria-label={t("chat.activityChain")}>
      <Card.Header className="mb-3 flex shrink-0 items-center justify-between p-0">
        <div className="flex min-w-0 items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{t("chat.activityChain")}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">{t("chat.activityChainDescription")}</p>
          </div>
        </div>
        <Chip size="sm" className="border border-border bg-background/70 text-muted">
          {nodes.length}
        </Chip>
      </Card.Header>
      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto pr-1" hideScrollBar={false}>
        <div className="relative space-y-3 pb-1">
          <div className="absolute bottom-4 left-[17px] top-4 w-px bg-border" aria-hidden="true" />
          {nodes.map((node, index) => {
            const selected = node.id === selectedNodeId;

            return (
              <Card
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectNode(node.id)}
                onKeyDown={(event) => handleKeyDown(event, node.id)}
                className={
                  selected
                    ? "relative cursor-pointer border border-accent/70 bg-accent/10 outline-none ring-1 ring-accent/20"
                    : "relative cursor-pointer border border-border bg-background/70 outline-none hover:border-accent/40 focus:border-accent/60"
                }
              >
                <Card.Content className="block p-3">
                  <span className="flex items-start gap-3">
                    <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {statusIcon(node.status)}
                        <Chip size="sm" className={`border bg-transparent ${statusChipClass(node.status)}`}>
                          {t(`chat.nodeStatus.${node.status}`)}
                        </Chip>
                        <span className="text-[11px] tabular-nums text-muted">{node.createdAt}</span>
                      </span>
                      <span className="mt-2 block truncate text-sm font-semibold text-foreground">{node.title}</span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted">{node.summary}</span>
                      <span className="mt-2 block text-[11px] uppercase tracking-wider text-muted">
                        <CircleDot className="mr-1 inline h-3 w-3" />
                        {t(`chat.nodeKinds.${node.kind}`)}
                      </span>
                    </span>
                  </span>
                </Card.Content>
              </Card>
            );
          })}
        </div>
      </ScrollShadow>
    </Card>
  );
}
