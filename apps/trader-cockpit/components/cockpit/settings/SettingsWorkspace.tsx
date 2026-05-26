"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

export function SettingsWorkspace() {
  const { t } = useTranslation();
  const density = useCockpitUiStore((state) => state.density);
  const setDensity = useCockpitUiStore((state) => state.setDensity);
  const chartTimeframe = useCockpitUiStore((state) => state.chartTimeframe);
  const setChartTimeframe = useCockpitUiStore((state) => state.setChartTimeframe);

  const settingsQuery = useQuery({
    queryKey: cockpitKeys.settings(),
    queryFn: () => cockpitAdapter.getToolSettings(),
  });

  if (settingsQuery.isLoading) {
    return <StateBlock state="loading" title={t("settings.loadingTitle")} description={t("settings.loadingDescription")} />;
  }

  if (settingsQuery.isError) {
    return <StateBlock state="error" title={t("settings.errorTitle")} description={t("settings.errorDescription")} />;
  }

  const settings = settingsQuery.data;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-md border border-border bg-card/80 p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("settings.localPreferences")}</p>
        <h2 className="mt-1 text-lg font-semibold">{t("settings.title")}</h2>
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">
            <span className="text-xs text-muted">{t("settings.density")}</span>
            <select
              value={density}
              onChange={(event) => setDensity(event.target.value as typeof density)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="compact">compact</option>
              <option value="comfortable">comfortable</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted">{t("settings.chartTimeframe")}</span>
            <select
              value={chartTimeframe}
              onChange={(event) => setChartTimeframe(event.target.value as typeof chartTimeframe)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
            </select>
          </label>
          <div className="rounded border border-border bg-background/60 p-3">
            <p className="text-xs text-muted">{t("settings.mockPollingDefault")}</p>
            <p className="mt-1 tabular-nums">{settings?.localPreferences.pollingIntervalSeconds ?? 60}s</p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card/80">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("settings.toolSources")}</p>
          <h2 className="mt-1 text-sm font-semibold">{t("settings.toolSourcesTitle")}</h2>
        </div>
        <div className="divide-y divide-border">
          {(settings?.tools ?? []).map((tool) => (
            <div key={tool.id} className="grid gap-2 px-4 py-3 md:grid-cols-[180px_120px_1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-medium">{tool.name}</p>
                <p className="mt-1 text-xs text-muted">{tool.sourceType}</p>
              </div>
              <span className="rounded border border-border px-2 py-1 text-xs text-muted">{t("common.readOnly")}</span>
              <p className="text-sm leading-5 text-muted">{tool.summary}</p>
              <span className={tool.enabled ? "text-xs text-positive" : "text-xs text-muted"}>
                {tool.enabled ? t("common.enabled") : t("common.hidden")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
