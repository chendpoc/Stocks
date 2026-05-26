"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SignalSummary } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

function riskClass(value: string) {
  if (value === "critical" || value === "high" || value === "block") return "text-danger";
  if (value === "medium" || value === "caution" || value === "watching" || value === "waiting_trigger" || value === "near_trigger") {
    return "text-warning";
  }
  return "text-positive";
}

type SignalColumn = {
  key: string;
  header: string;
  render: (signal: SignalSummary) => ReactNode;
};

export function SignalsWorkspace() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("all");
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status }),
    queryFn: () => cockpitAdapter.listSignals({ status }),
  });
  const signals = signalsQuery.data?.signals ?? [];
  const effectiveSignalId = selectedSignalId ?? signals[0]?.id ?? null;
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
        render: (signal) => <span className={riskClass(signal.status)}>{signal.status}</span>,
      },
      {
        key: "tags",
        header: t("common.tags"),
        render: (signal) => (
          <div className="flex flex-wrap gap-1">
            {signal.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
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
      <section className="rounded-md border border-border bg-card/80">
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-background text-[11px] uppercase tracking-wider text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="border-b border-border px-3 py-2 font-medium">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr
                  key={signal.id}
                  onClick={() => {
                    setSelectedSignalId(signal.id);
                    setSelectedSymbol(signal.symbol);
                  }}
                  className={
                    signal.id === effectiveSignalId
                      ? "cursor-pointer border-l-2 border-accent bg-panel"
                      : "cursor-pointer border-l-2 border-transparent hover:bg-panel/70"
                  }
                >
                  {columns.map((column) => (
                    <td key={column.key} className="border-b border-border px-3 py-2">
                      {column.render(signal)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="rounded-md border border-border bg-card/80 p-4">
        {detailQuery.data ? (
          <>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("signals.detail")}</p>
            <h2 className="mt-1 text-lg font-semibold">
              {detailQuery.data.symbol} / {detailQuery.data.setup}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">{detailQuery.data.thesis}</p>
            <div className="mt-4 grid gap-3">
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("common.scenarioPlan")}</p>
                <p className="mt-2 text-sm">{detailQuery.data.scenarioPlan.summary}</p>
                <div className="mt-3 grid gap-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{t("common.trigger")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.entryTrigger}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.invalidation")}</p>
                    <p className="mt-1 text-warning">{detailQuery.data.invalidation}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.nextWatch")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.nextWatch}</p>
                  </div>
                </div>
              </section>
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("signals.ruleHits")}</p>
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
                <p className="text-xs text-muted">{t("common.evidence")}</p>
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
