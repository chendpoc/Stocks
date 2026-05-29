"use client";

import { useTranslation } from "react-i18next";
import type { MarketIntentExplanation } from "@/lib/cockpit/adapter";
import { MockMarketChart } from "@/components/cockpit/charts/MockMarketChart";

type DashboardMarketIntentStripProps = {
  marketGate: string;
  MarketGateIcon: React.ComponentType<{ className?: string }>;
  explanation?: MarketIntentExplanation;
  isLoading?: boolean;
};

export function DashboardMarketIntentStrip({
  marketGate,
  MarketGateIcon,
  explanation,
  isLoading = false,
}: DashboardMarketIntentStripProps) {
  const { t } = useTranslation();
  const whyNowChips = explanation?.whyNow.slice(0, 3) ?? [];
  const whyWaitChips = explanation?.whyWait.slice(0, 2) ?? [];

  if (isLoading) {
    return (
      <section
        data-testid="dashboardL2MarketIntentSummary"
        className="shrink-0 rounded-md border border-success/20 bg-surface/80 px-3 py-4"
        aria-busy="true"
        aria-label={t("dashboard.marketIntentExplanation")}
      >
        <div className="flex min-h-[76px] animate-pulse flex-col gap-3 lg:flex-row">
          <span className="h-14 w-28 rounded bg-surface-secondary" />
          <span className="h-14 w-44 rounded bg-surface-secondary" />
          <span className="h-14 min-w-0 flex-1 rounded bg-surface-secondary" />
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="dashboardL2MarketIntentSummary"
      className="shrink-0 rounded-md border border-success/20 bg-surface/80"
      aria-label={t("dashboard.marketIntentExplanation")}
    >
      <div data-testid="dashboardL2MarketIntentStrip" className="grid min-h-[76px] min-w-0 gap-3 px-3 py-2 lg:grid-cols-[116px_190px_minmax(0,1fr)]">
        <div className="activeMarketIntentChip flex min-h-[58px] items-center gap-2 border-l-2 border-success px-3 text-success">
          <MarketGateIcon className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted">{t("dashboard.marketGate")}</p>
            <p className="truncate text-sm font-semibold uppercase">{marketGate}</p>
          </div>
        </div>
        <div className="min-w-[170px] border-r border-border pr-3">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t("dashboard.marketIntentStripSymbol")}</p>
          <p className="truncate text-sm font-semibold">SPY · 12 + 3</p>
          <p className="truncate text-[11px] text-muted" title={explanation?.summary}>
            {explanation?.summary}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden text-xs">
          {whyNowChips.map((item) => (
            <span key={`now-${item}`} className="max-w-[220px] truncate rounded border border-success/40 bg-success/10 px-2 py-1 text-success" title={item}>
              {t("dashboard.whyNowShort")} · {item}
            </span>
          ))}
          {whyWaitChips.map((item) => (
            <span key={`wait-${item}`} className="max-w-[220px] truncate rounded border border-warning/40 bg-warning/10 px-2 py-1 text-warning" title={item}>
              {t("dashboard.whyWaitShort")} · {item}
            </span>
          ))}
          <span className="max-w-[260px] truncate rounded border border-border px-2 py-1 text-muted" title={explanation?.nextWatchCondition}>
            {t("dashboard.nextWatchCondition")} · {explanation?.nextWatchCondition}
          </span>
          <span className="rounded border border-border px-2 py-1 text-muted">
            {t("dashboard.relatedEvidence")} · {explanation?.evidenceCount ?? 0} {t("dashboard.evidenceCount")}
          </span>
        </div>
        <div className="hidden">
          <MockMarketChart />
        </div>
      </div>
    </section>
  );
}
