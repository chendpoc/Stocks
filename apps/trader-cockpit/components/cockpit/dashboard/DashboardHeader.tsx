"use client";

import { Button, Input } from "@heroui/react";
import { RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

type DashboardHeaderProps = {
  headerSearchDraft: string;
  onHeaderSearchDraftChange: (value: string) => void;
  onCommitSearch: () => void;
  onRefresh: () => void;
};

export function DashboardHeader({
  headerSearchDraft,
  onHeaderSearchDraftChange,
  onCommitSearch,
  onRefresh,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <section data-testid="dashboardLiveHeader" className="shrink-0 border-b border-border pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{t("dashboard.liveCommandTitle")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("dashboard.liveCommandSubtitle")}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-foreground">
            SPY
          </span>
          <span className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
            {t("dashboard.dataFreshness")}: 1m
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="border-border text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.refresh")}
          </Button>
          <div className="relative min-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t("dashboard.headerSearchPlaceholder")}
              value={headerSearchDraft}
              onChange={(event) => onHeaderSearchDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onCommitSearch();
                }
              }}
              className="h-10 w-full rounded-md border border-border bg-surface pl-9 text-sm text-foreground placeholder:text-muted"
              placeholder={t("dashboard.headerSearchPlaceholder")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
