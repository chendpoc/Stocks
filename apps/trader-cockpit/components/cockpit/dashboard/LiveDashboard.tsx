"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDotDashed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { MockMarketChart } from "@/components/cockpit/charts/MockMarketChart";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { AgentActionTimeline } from "@/components/cockpit/timeline/AgentActionTimeline";

function riskClass(riskLevel: string) {
  if (riskLevel === "critical" || riskLevel === "high") return "text-danger";
  if (riskLevel === "medium") return "text-warning";
  return "text-positive";
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status: "all" }),
    queryFn: () => cockpitAdapter.listSignals({ status: "all" }),
  });
  const eventsQuery = useQuery({
    queryKey: cockpitKeys.agentEvents({ scope: "all" }),
    queryFn: () => cockpitAdapter.listAgentEvents({ scope: "all" }),
  });

  if (signalsQuery.isLoading || eventsQuery.isLoading) {
    return <StateBlock state="loading" title={t("dashboard.loadingTitle")} description={t("dashboard.loadingDescription")} />;
  }

  if (signalsQuery.isError || eventsQuery.isError) {
    return <StateBlock state="error" title={t("dashboard.errorTitle")} description={t("dashboard.errorDescription")} />;
  }

  const signals = signalsQuery.data?.signals ?? [];
  const watchlist = signalsQuery.data?.watchlist ?? [];
  const selectedSignal = signals.find((signal) => signal.id === selectedSignalId) ?? signals[0];
  const invalidatedSignals = signals.filter((signal) => signal.status === "invalidated").length;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div data-testid="dashboardStatusStack" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.marketGate")}</p>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" />
              CAUTION
            </div>
          </div>
          <div className="rounded-md border border-border bg-card/80 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.openSignals")}</p>
            <p className="mt-2 text-lg font-semibold tabular-nums">{signals.length}</p>
          </div>
          <div className="rounded-md border border-border bg-card/80 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.invalidated")}</p>
            <p className="mt-2 text-lg font-semibold text-warning tabular-nums">{invalidatedSignals}</p>
          </div>
          <div className="rounded-md border border-positive/40 bg-positive/10 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.dataFreshness")}</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium text-positive">
              <CheckCircle2 className="h-4 w-4" />
              {t("dashboard.mockLive")}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card/80">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.watchlistKicker")}</p>
            <h2 className="mt-1 text-sm font-semibold">{t("dashboard.watchlistTitle")}</h2>
          </div>
          <div className="divide-y divide-border">
            {watchlist.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSelectedSymbol(item.symbol)}
                className="grid w-full grid-cols-[52px_1fr_auto] gap-3 px-4 py-3 text-left hover:bg-panel/70"
              >
                <div>
                  <p className="font-semibold">{item.symbol}</p>
                  <p className={`text-xs tabular-nums ${item.changePct >= 0 ? "text-positive" : "text-danger"}`}>
                    {item.changePct >= 0 ? "+" : ""}
                    {item.changePct}%
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{item.setup}</p>
                  <p className="mt-1 truncate text-xs text-muted">{item.reason}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">{item.score}</p>
                  <p className={`text-xs ${riskClass(item.riskLevel)}`}>{item.riskLevel}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card/80">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.signalQueue")}</p>
          </div>
          <div className="divide-y divide-border">
            {signals.map((signal) => (
              <button
                key={signal.id}
                type="button"
                onClick={() => {
                  setSelectedSignalId(signal.id);
                  setSelectedSymbol(signal.symbol);
                }}
                className={
                  signal.id === selectedSignal?.id
                    ? "w-full border-l-2 border-accent bg-panel px-4 py-3 text-left"
                    : "w-full border-l-2 border-transparent px-4 py-3 text-left hover:bg-panel/70"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{signal.symbol}</span>
                  <span className={`text-xs ${riskClass(signal.riskLevel)}`}>{signal.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{signal.entryTrigger}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <MockMarketChart />
        {selectedSignal ? (
          <section className="rounded-md border border-border bg-card/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.selectedSignal")}</p>
                <h2 className="mt-1 text-base font-semibold">
                  {selectedSignal.symbol} / {selectedSignal.setup}
                </h2>
              </div>
              <span className={`rounded border border-border px-2 py-1 text-xs ${riskClass(selectedSignal.riskLevel)}`}>
                {selectedSignal.riskLevel} {t("common.risk")}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("common.trigger")}</p>
                <p className="mt-2 text-sm">{selectedSignal.entryTrigger}</p>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("common.invalidation")}</p>
                <p className="mt-2 text-sm text-warning">{selectedSignal.invalidation}</p>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("common.scenarioPlan")}</p>
                <p className="mt-2 text-sm">{selectedSignal.scenarioPlan.summary}</p>
              </div>
            </div>
          </section>
        ) : (
          <StateBlock title={t("dashboard.noSignalTitle")} description={t("dashboard.noSignalDescription")} />
        )}
      </section>

      <section className="space-y-4">
        <section className="rounded-md border border-border bg-card/80 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.agentState")}</p>
          <h2 className="mt-1 text-sm font-semibold">{t("dashboard.readOnlyMode")}</h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("dashboard.streamChannel")}</span>
              <span className="text-positive">{t("dashboard.mockReady")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("dashboard.signalSource")}</span>
              <span className="text-warning">{t("common.mockFallback")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("dashboard.refreshModel")}</span>
              <span className="text-muted">{t("dashboard.pollingLater")}</span>
            </div>
          </div>
        </section>
        <section className="rounded-md border border-border bg-card/80 p-4">
          <div className="flex items-center gap-2 text-warning">
            <CircleDotDashed className="h-4 w-4" />
            <h2 className="text-sm font-semibold">{t("common.nextWatch")}</h2>
          </div>
          {selectedSignal ? (
            <div className="mt-3 text-sm">
              <p>{selectedSignal.nextWatch}</p>
              <p className="mt-2 text-xs leading-5 text-muted">{selectedSignal.marketIntent}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">{t("dashboard.noSelectedSignal")}</p>
          )}
        </section>
        <AgentActionTimeline events={eventsQuery.data?.events ?? []} />
      </section>
    </div>
  );
}
