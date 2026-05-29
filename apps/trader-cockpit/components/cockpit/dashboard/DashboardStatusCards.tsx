"use client";

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { gateClass } from "@/lib/cockpit/style-utils";

type DashboardStatusCardsProps = {
  marketGate: string;
  MarketGateIcon: React.ComponentType<{ className?: string }>;
  signalsCount: number;
  invalidatedCount: number;
  isLoading?: boolean;
};

function MetricValue({ isLoading, value }: { isLoading?: boolean; value: ReactNode }) {
  if (isLoading) {
    return <span className="mt-2 inline-block h-7 w-10 animate-pulse rounded bg-surface-secondary" aria-hidden />;
  }

  return <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>;
}

export function DashboardStatusCards({
  marketGate,
  MarketGateIcon,
  signalsCount,
  invalidatedCount,
  isLoading = false,
}: DashboardStatusCardsProps) {
  const { t } = useTranslation();

  return (
    <section data-testid="dashboardL1StatusRow" className="shrink-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div data-testid="dashboardMarketGateCard" className={`rounded-md border p-3 ${gateClass(marketGate)}`}>
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.marketGate")}</p>
        <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
          {isLoading ? (
            <span className="inline-block h-7 w-16 animate-pulse rounded bg-surface-secondary" aria-hidden />
          ) : (
            <>
              <MarketGateIcon className="h-4 w-4" />
              {marketGate.toUpperCase()}
            </>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border bg-surface/80 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.openSignals")}</p>
        <MetricValue isLoading={isLoading} value={signalsCount} />
      </div>
      <div className="rounded-md border border-border bg-surface/80 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.invalidated")}</p>
        {isLoading ? (
          <span className="mt-2 inline-block h-7 w-10 animate-pulse rounded bg-surface-secondary" aria-hidden />
        ) : (
          <p className="mt-2 text-lg font-semibold text-warning tabular-nums">{invalidatedCount}</p>
        )}
      </div>
      <div className="rounded-md border border-success/40 bg-success/10 p-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.dataFreshness")}</p>
        <div className="mt-2 flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          {t("dashboard.mockLive")}
        </div>
      </div>
    </section>
  );
}
