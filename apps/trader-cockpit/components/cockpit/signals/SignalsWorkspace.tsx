"use client";

import { Table } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CockpitTag, SignalStatus, SignalSummary } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

function riskClass(value: string) {
  if (value === "critical" || value === "high" || value === "block") return "text-danger";
  if (value === "medium" || value === "caution" || value === "watching" || value === "waiting_trigger" || value === "near_trigger") {
    return "text-warning";
  }
  return "text-success";
}

function statusClass(status: SignalStatus) {
  if (status === "invalidated") return "border-danger/50 bg-danger/10 text-danger";
  if (status === "triggered_for_attention") return "border-danger/50 bg-danger/10 text-danger";
  if (status === "near_trigger" || status === "waiting_trigger") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (status === "needs_more_evidence") return "border-accent/50 bg-accent/10 text-accent";
  return "border-success/50 bg-success/10 text-success";
}

function tagClass(tag: CockpitTag) {
  if (tag === "opportunity_watch") return "border-danger/40 bg-danger/10 text-danger";
  if (tag === "market_intent") return "border-success/40 bg-success/10 text-success";
  if (tag === "rule_learning") return "border-accent/40 bg-accent/10 text-accent";
  if (tag === "risk_or_invalidation") return "border-warning/50 bg-warning/10 text-warning";
  if (tag === "news_event") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-background/60 text-muted";
}

type SignalColumn = {
  key: string;
  header: string;
  render: (signal: SignalSummary) => ReactNode;
};

export function SignalsWorkspace({ initialSignalId }: { initialSignalId?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("all");
  const [pendingInitialSignalId, setPendingInitialSignalId] = useState<string | null | undefined>(initialSignalId);
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status }),
    queryFn: () => cockpitAdapter.listSignals({ status }),
  });
  const signals = signalsQuery.data?.signals ?? [];
  const requestedSignalId = initialSignalId ?? selectedSignalId;
  const effectiveSignalId = pendingInitialSignalId ?? requestedSignalId ?? signals[0]?.id ?? null;
  const detailQuery = useQuery({
    queryKey: cockpitKeys.signal(effectiveSignalId ?? "none"),
    queryFn: () => {
      if (!effectiveSignalId) {
        throw new Error("Signal detail query requires a selected or fallback signal id.");
      }

      return cockpitAdapter.getSignal({ id: effectiveSignalId });
    },
    enabled: Boolean(effectiveSignalId),
  });

  useEffect(() => {
    setPendingInitialSignalId(initialSignalId);
  }, [initialSignalId]);

  useEffect(() => {
    if (!pendingInitialSignalId || !detailQuery.data || detailQuery.data.id !== pendingInitialSignalId) {
      return;
    }

    setSelectedSignalId(effectiveSignalId);
    setSelectedSymbol(detailQuery.data.symbol);
    setPendingInitialSignalId(null);
  }, [detailQuery.data, effectiveSignalId, pendingInitialSignalId, setSelectedSignalId, setSelectedSymbol]);

  const columns = useMemo<SignalColumn[]>(
    () => [
      { key: "symbol", header: t("signals.ticker"), render: (signal) => signal.symbol },
      { key: "timeframe", header: t("common.timeframe"), render: (signal) => signal.timeframe },
      { key: "setup", header: t("common.setup"), render: (signal) => signal.setup },
      {
        key: "score",
        header: t("common.score"),
        render: (signal) => <span className="tabular-nums">{signal.score}</span>,
      },
      {
        key: "status",
        header: t("common.status"),
        render: (signal) => (
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${statusClass(signal.status)}`}>
            {signal.status}
          </span>
        ),
      },
      {
        key: "tags",
        header: t("common.tags"),
        render: (signal) => (
          <div className="flex flex-wrap gap-1">
            {signal.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={`rounded border px-1.5 py-0.5 text-[11px] ${tagClass(tag)}`}>
                {tag}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "marketGate",
        header: t("common.gate"),
        render: (signal) => <span className={riskClass(signal.marketGate)}>{signal.marketGate}</span>,
      },
      {
        key: "traderMatch",
        header: t("signals.trader"),
        render: (signal) => <span className="tabular-nums">{Math.round(signal.traderMatch * 100)}%</span>,
      },
      { key: "nextWatch", header: t("common.nextWatch"), render: (signal) => signal.nextWatch },
      { key: "updatedAt", header: t("common.updated"), render: (signal) => signal.updatedAt },
    ],
    [t],
  );

  if (signalsQuery.isLoading) {
    return <StateBlock state="loading" title={t("signals.loadingTitle")} description={t("signals.loadingDescription")} />;
  }

  if (signalsQuery.isError) {
    return <StateBlock state="error" title={t("signals.errorTitle")} description={t("signals.errorDescription")} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-md border border-border bg-surface/80">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("signals.workspace")}</p>
            <h2 className="mt-1 text-sm font-semibold">{t("signals.subtitle")}</h2>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            aria-label={t("signals.statusFilter")}
          >
            {["all", "watching", "waiting_trigger", "near_trigger", "triggered_for_attention", "invalidated", "needs_more_evidence"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label={t("signals.workspace")}>
              <Table.Header>
                {columns.map((column) => (
                  <Table.Column key={column.key}>{column.header}</Table.Column>
                ))}
              </Table.Header>
              <Table.Body>
                {signals.map((signal) => (
                  <Table.Row
                    key={signal.id}
                    onClick={() => {
                      setSelectedSignalId(signal.id);
                      setSelectedSymbol(signal.symbol);
                    }}
                    className={
                      signal.id === effectiveSignalId
                        ? "cursor-pointer border-l-2 border-accent bg-surface-secondary"
                        : "cursor-pointer border-l-2 border-transparent hover:bg-surface-secondary/70"
                    }
                  >
                    {columns.map((column) => (
                      <Table.Cell key={column.key}>{column.render(signal)}</Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </section>
      <aside className="rounded-md border border-border bg-surface/80 p-4">
        {detailQuery.data ? (
          <>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("signals.detail")}</p>
            <h2 className="mt-1 text-lg font-semibold">
              {detailQuery.data.symbol} / {detailQuery.data.setup}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs ${statusClass(detailQuery.data.status)}`}>
                {detailQuery.data.status}
              </span>
              {detailQuery.data.tags.map((tag) => (
                <span key={tag} className={`rounded border px-2 py-1 text-xs ${tagClass(tag)}`}>
                  {tag}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{detailQuery.data.thesis}</p>
            <div className="mt-4 grid gap-3">
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("signals.triggerInvalidation")}</p>
                <p className="mt-2 text-sm">{detailQuery.data.scenarioPlan.summary}</p>
                <div className="mt-3 grid gap-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{t("common.trigger")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.entryTrigger}</p>
                    <div className="mt-2 space-y-1">
                      {detailQuery.data.scenarioPlan.triggerConditions.map((condition) => (
                        <p key={condition} className="rounded border border-danger/30 bg-danger/10 px-2 py-1 text-danger">
                          {condition}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.invalidation")}</p>
                    <p className="mt-1 text-warning">{detailQuery.data.invalidation}</p>
                    <div className="mt-2 space-y-1">
                      {detailQuery.data.scenarioPlan.invalidationConditions.map((condition) => (
                        <p key={condition} className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-warning">
                          {condition}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.nextWatch")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.nextWatch}</p>
                  </div>
                </div>
              </section>
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("signals.relatedRules")}</p>
                <div className="mt-2 space-y-2">
                  {detailQuery.data.ruleHits.map((hit) => (
                    <div key={hit.ruleId} className="rounded border border-warning/40 bg-warning/10 p-2 text-xs">
                      <p className="font-medium text-warning">{hit.label}</p>
                      <p className="mt-1 text-muted">{hit.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">
                  {t("signals.evidence")} / {detailQuery.data.evidence.length}
                </p>
                <div className="mt-2 space-y-2">
                  {detailQuery.data.evidence.map((evidence) => (
                    <div key={evidence.id} className="rounded border border-border p-2 text-xs">
                      <p className="font-medium">{evidence.title}</p>
                      <p className="mt-1 text-muted">
                        {evidence.source} / {Math.round(evidence.confidence * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <StateBlock
                title={t("signals.displayOnlyTitle")}
                description={t("signals.displayOnlyDescription")}
              />
            </div>
          </>
        ) : (
          <StateBlock title={t("signals.noSelectionTitle")} description={t("signals.noSelectionDescription")} />
        )}
      </aside>
    </div>
  );
}
