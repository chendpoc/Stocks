"use client";

import { useTranslation } from "react-i18next";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";

const points = [
  [0, 74],
  [28, 68],
  [56, 70],
  [84, 48],
  [112, 52],
  [140, 35],
  [168, 42],
  [196, 28],
  [224, 32],
  [252, 18],
  [280, 24],
  [308, 16],
  [336, 20],
  [364, 12],
];

function pathFromPoints() {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

export function MockMarketChart() {
  const { t } = useTranslation();
  const timeframe = useCockpitUiStore((state) => state.chartTimeframe);
  const setChartTimeframe = useCockpitUiStore((state) => state.setChartTimeframe);

  return (
    <section className="rounded-md border border-border bg-surface/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("chart.kicker")}</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{t("chart.title")}</h2>
        </div>
        <div className="flex rounded-md border border-border bg-background/70 p-0.5 text-xs">
          {(["5m", "15m", "1h"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setChartTimeframe(value)}
              className={
                timeframe === value
                  ? "rounded bg-accent px-2.5 py-1 font-medium text-accent-foreground"
                  : "rounded px-2.5 py-1 text-muted hover:text-foreground"
              }
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 rounded border border-border bg-background/70 p-3">
        <svg viewBox="0 0 364 92" role="img" aria-label={t("chart.aria")} className="h-full w-full">
          <defs>
            <linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(79, 209, 197)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(79, 209, 197)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[16, 32, 48, 64, 80].map((line) => (
            <line key={line} x1="0" x2="364" y1={line} y2={line} stroke="rgba(132,146,166,0.18)" />
          ))}
          <path d={`${pathFromPoints()} L 364 92 L 0 92 Z`} fill="url(#chartArea)" />
          <path d={pathFromPoints()} fill="none" stroke="rgb(79, 209, 197)" strokeWidth="2.4" />
          <line x1="0" x2="364" y1="44" y2="44" stroke="rgb(226,164,66)" strokeDasharray="5 5" />
          <circle cx="252" cy="18" r="4" fill="rgb(42,190,123)" />
          <circle cx="112" cy="52" r="4" fill="rgb(235,92,92)" />
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs tabular-nums">
        <div className="rounded border border-border bg-background/60 p-2">
          <p className="text-muted">{t("chart.vwap")}</p>
          <p className="mt-1 font-medium text-warning">421.20</p>
        </div>
        <div className="rounded border border-border bg-background/60 p-2">
          <p className="text-muted">{t("chart.trigger")}</p>
          <p className="mt-1 font-medium text-success">423.10</p>
        </div>
        <div className="rounded border border-border bg-background/60 p-2">
          <p className="text-muted">{t("chart.invalidation")}</p>
          <p className="mt-1 font-medium text-danger">419.20</p>
        </div>
      </div>
    </section>
  );
}
