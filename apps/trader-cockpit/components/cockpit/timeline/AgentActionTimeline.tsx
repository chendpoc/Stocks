"use client";

import { Activity, AlertTriangle, CheckCircle2, CircleDotDashed } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentEvent, AgentEventStatus } from "@/lib/cockpit/adapter";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";

const statusIcon: Record<AgentEventStatus, typeof Activity> = {
  running: CircleDotDashed,
  succeeded: CheckCircle2,
  failed: AlertTriangle,
  blocked: AlertTriangle,
};

const statusClass: Record<AgentEventStatus, string> = {
  running: "text-accent",
  succeeded: "text-positive",
  failed: "text-danger",
  blocked: "text-warning",
};

export function AgentActionTimeline({ events }: { events: AgentEvent[] }) {
  const { t } = useTranslation();
  const mode = useCockpitUiStore((state) => state.timelineMode);
  const setMode = useCockpitUiStore((state) => state.setTimelineMode);

  return (
    <section className="rounded-md border border-border bg-card/80">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("timeline.kicker")}</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">{t("timeline.title")}</h2>
        </div>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          aria-label={t("timeline.modeAria")}
        >
          <option value="simple">{t("timeline.simple")}</option>
          <option value="detailed">{t("timeline.detailed")}</option>
          <option value="developer">{t("timeline.developer")}</option>
        </select>
      </div>
      <ol className="divide-y divide-border">
        {events.map((event) => {
          const Icon = statusIcon[event.status];

          return (
            <li key={event.id} className="flex gap-3 px-4 py-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${statusClass[event.status]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{event.eventType}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-muted">{event.status}</span>
                  <span className="text-muted tabular-nums">{event.createdAt}</span>
                  {event.durationMs ? <span className="text-muted tabular-nums">{event.durationMs}ms</span> : null}
                </div>
                {mode !== "simple" ? <p className="mt-1 text-sm leading-5 text-muted">{event.summary}</p> : null}
                {mode === "developer" ? (
                  <pre className="mt-2 overflow-x-auto rounded border border-border bg-background p-2 text-[11px] text-muted">
                    {JSON.stringify({ runId: event.runId, toolName: event.toolName, evidenceIds: event.evidenceIds }, null, 2)}
                  </pre>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
