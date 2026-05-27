"use client";

import type { KeyboardEvent } from "react";
import { RadioTower } from "lucide-react";
import { Card, Chip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentWorkstream } from "@/lib/cockpit/adapter";

type WorkstreamRailProps = {
  workstreams: AgentWorkstream[];
  selectedWorkstreamId: string;
  onSelectWorkstream: (workstreamId: string) => void;
};

function statusClass(status: AgentWorkstream["status"]): string {
  if (status === "active") {
    return "border-success/50 bg-success/10 text-success";
  }
  if (status === "updated") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  return "border-border bg-background/70 text-muted";
}

export function WorkstreamRail({ workstreams, selectedWorkstreamId, onSelectWorkstream }: WorkstreamRailProps) {
  const { t } = useTranslation();

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, workstreamId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectWorkstream(workstreamId);
  }

  return (
    <Card className="border border-border bg-surface/80 p-3" aria-label={t("chat.workstreams")}>
      <Card.Header className="mb-3 flex items-center justify-between gap-3 p-0">
        <span className="flex min-w-0 items-center gap-2">
          <RadioTower className="h-4 w-4 text-accent" />
          <span className="truncate text-sm font-semibold">{t("chat.workstreams")}</span>
        </span>
        <span className="text-[11px] text-muted">{workstreams.length}</span>
      </Card.Header>
      <Card.Content className="grid gap-2 p-0 md:grid-cols-3">
        {workstreams.map((workstream) => {
          const selected = workstream.id === selectedWorkstreamId;

          return (
            <Card
              key={workstream.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectWorkstream(workstream.id)}
              onKeyDown={(event) => handleKeyDown(event, workstream.id)}
              className={
                selected
                  ? "cursor-pointer border border-accent/60 bg-accent/10 outline-none ring-1 ring-accent/20"
                  : "cursor-pointer border border-border bg-background/70 outline-none hover:border-accent/40 hover:bg-surface-secondary focus:border-accent/60"
              }
            >
              <Card.Content className="block min-w-0 p-3">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{workstream.title}</span>
                    <span className="mt-1 block truncate text-[11px] text-muted">{workstream.symbols.join(" / ")}</span>
                  </span>
                  {workstream.unreadCount > 0 ? (
                    <span className="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                      {workstream.unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 block truncate text-xs leading-5 text-muted">{workstream.summary}</span>
                <span className="mt-3 flex items-center justify-between gap-2">
                  <Chip size="sm" className={`border bg-transparent ${statusClass(workstream.status)}`}>
                    {t(`chat.workstreamStatus.${workstream.status}`)}
                  </Chip>
                  <span className="text-[10px] tabular-nums text-muted">{workstream.updatedAt}</span>
                </span>
              </Card.Content>
            </Card>
          );
        })}
      </Card.Content>
    </Card>
  );
}
