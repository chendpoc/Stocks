"use client";

import { BellRing } from "lucide-react";
import { Button, Card, Chip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentConsoleMessage } from "@/lib/cockpit/adapter";

type PriorityPushStripProps = {
  pushes: AgentConsoleMessage[];
  selectedMessageId: string | null;
  onSelectPush: (message: AgentConsoleMessage) => void;
};

function tagClass(tag: string): string {
  if (tag === "risk_or_invalidation") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (tag === "rule_learning" || tag === "post_validation") {
    return "border-accent/50 bg-accent/10 text-accent";
  }
  return "border-success/50 bg-success/10 text-success";
}

export function PriorityPushStrip({ pushes, selectedMessageId, onSelectPush }: PriorityPushStripProps) {
  const { t } = useTranslation();

  return (
    <Card className="border border-border bg-surface/80 p-3" aria-label={t("chat.priorityPush")}>
      <Card.Header className="mb-3 flex items-center justify-between p-0">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold">{t("chat.priorityPush")}</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted">{t("common.readOnly")}</span>
      </Card.Header>
      <Card.Content className="grid gap-2 p-0 xl:grid-cols-3">
        {pushes.map((push) => {
          const selected = push.id === selectedMessageId;

          return (
            <Button
              key={push.id}
              type="button"
              variant="outline"
              fullWidth
              onClick={() => onSelectPush(push)}
              className={
                selected
                  ? "h-auto justify-start border-warning/60 bg-warning/10 p-3 text-left shadow-sm shadow-warning/10"
                  : "h-auto justify-start border-border bg-background/70 p-3 text-left hover:border-warning/40 hover:bg-surface-secondary"
              }
            >
              <span className="block min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wider text-muted">{push.createdAt}</span>
                <Chip size="sm" className="border border-border bg-transparent uppercase text-muted">
                  {t("chat.agentPush")}
                </Chip>
                </span>
                <span className="mt-2 block line-clamp-2 text-sm leading-5 text-foreground">{push.text}</span>
                <span className="mt-3 flex flex-wrap gap-1.5">
                {push.tags.map((tag) => (
                  <Chip key={tag} size="sm" className={`border bg-transparent ${tagClass(tag)}`}>
                    {tag}
                  </Chip>
                ))}
                </span>
              </span>
            </Button>
          );
        })}
      </Card.Content>
    </Card>
  );
}
