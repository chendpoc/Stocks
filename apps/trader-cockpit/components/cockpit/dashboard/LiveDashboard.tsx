"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Chip, Drawer } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDotDashed, ExternalLink, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter, type TodayFocusItem } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { MockMarketChart } from "@/components/cockpit/charts/MockMarketChart";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

const todayFocusTypes: TodayFocusItem["type"][] = [
  "opportunity",
  "watchlist",
  "news_event",
  "rule_match",
  "next_watch",
  "outcome_review",
];

const todayFocusStatuses: TodayFocusItem["status"][] = ["active", "waiting", "triggered", "invalidated", "reviewed"];
const todayFocusPageSize = 5;
const todayFocusTypeLabels: Record<TodayFocusItem["type"], string> = {
  opportunity: "dashboard.todayFocusTypes.opportunity",
  watchlist: "dashboard.todayFocusTypes.watchlist",
  news_event: "dashboard.todayFocusTypes.newsEvent",
  rule_match: "dashboard.todayFocusTypes.ruleMatch",
  next_watch: "dashboard.todayFocusTypes.nextWatch",
  outcome_review: "dashboard.todayFocusTypes.outcomeReview",
};
const todayFocusStatusLabels: Record<TodayFocusItem["status"], string> = {
  active: "dashboard.todayFocusStatuses.active",
  waiting: "dashboard.todayFocusStatuses.waiting",
  triggered: "dashboard.todayFocusStatuses.triggered",
  invalidated: "dashboard.todayFocusStatuses.invalidated",
  reviewed: "dashboard.todayFocusStatuses.reviewed",
};

function gateClass(marketGate: string) {
  if (marketGate === "block") return "border-danger/50 bg-danger/10 text-danger";
  if (marketGate === "caution") return "border-warning/50 bg-warning/10 text-warning";
  return "border-success/50 bg-success/10 text-success";
}

function statusClass(status: TodayFocusItem["status"]) {
  if (status === "triggered" || status === "active") return "border-success/40 text-success";
  if (status === "invalidated") return "border-danger/40 text-danger";
  if (status === "waiting") return "border-warning/40 text-warning";
  return "border-border text-muted";
}

function buildTodayFocusHref(item: TodayFocusItem) {
  const params = new URLSearchParams({ [item.target.queryKey]: item.target.queryValue });
  return `${item.target.route}?${params.toString()}`;
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);
  const [todayFocusQuery, setTodayFocusQuery] = useState("");
  const [todayFocusType, setTodayFocusType] = useState<TodayFocusItem["type"] | "all">("all");
  const [todayFocusStatus, setTodayFocusStatus] = useState<TodayFocusItem["status"] | "all">("all");
  const [todayFocusPage, setTodayFocusPage] = useState(1);
  const [selectedTodayFocusItem, setSelectedTodayFocusItem] = useState<TodayFocusItem | null>(null);

  const todayFocusFilters = useMemo(
    () => ({
      query: todayFocusQuery,
      type: todayFocusType === "all" ? undefined : todayFocusType,
      status: todayFocusStatus === "all" ? undefined : todayFocusStatus,
      page: todayFocusPage,
      pageSize: todayFocusPageSize,
    }),
    [todayFocusPage, todayFocusQuery, todayFocusStatus, todayFocusType],
  );

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status: "all" }),
    queryFn: () => cockpitAdapter.listSignals({ status: "all" }),
  });
  const marketIntentQuery = useQuery({
    queryKey: cockpitKeys.marketIntentExplanation(),
    queryFn: () => cockpitAdapter.getMarketIntentExplanation(),
  });
  const todayFocusQueryResult = useQuery({
    queryKey: cockpitKeys.todayFocus(todayFocusFilters),
    queryFn: () => cockpitAdapter.listTodayFocus(todayFocusFilters),
  });

  if (signalsQuery.isLoading || marketIntentQuery.isLoading || todayFocusQueryResult.isLoading) {
    return <StateBlock state="loading" title={t("dashboard.loadingTitle")} description={t("dashboard.loadingDescription")} />;
  }

  if (signalsQuery.isError || marketIntentQuery.isError || todayFocusQueryResult.isError) {
    return <StateBlock state="error" title={t("dashboard.errorTitle")} description={t("dashboard.errorDescription")} />;
  }

  const signals = signalsQuery.data?.signals ?? [];
  const marketIntentExplanation = marketIntentQuery.data?.explanation;
  const todayFocus = todayFocusQueryResult.data;
  const todayFocusItems = todayFocus?.items ?? [];
  const totalTodayFocus = todayFocus?.total ?? 0;
  const currentPage = todayFocus?.page ?? todayFocusPage;
  const pageSize = todayFocus?.pageSize ?? todayFocusPageSize;
  const maxPage = Math.max(1, Math.ceil(totalTodayFocus / pageSize));
  const showingStart = totalTodayFocus === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingEnd = totalTodayFocus === 0 ? 0 : Math.min(totalTodayFocus, showingStart + todayFocusItems.length - 1);
  const marketGate = marketIntentExplanation?.marketGate ?? "caution";
  const MarketGateIcon = marketGate === "pass" ? CheckCircle2 : AlertTriangle;
  const invalidatedSignals = signals.filter((signal) => signal.status === "invalidated").length;

  function resetFocusPage() {
    setTodayFocusPage(1);
  }

  function bindTodayFocusContext(item: TodayFocusItem) {
    if (item.symbol) {
      setSelectedSymbol(item.symbol);
    }

    if (item.target.queryKey === "signalId") {
      setSelectedSignalId(item.target.queryValue);
    } else {
      setSelectedSignalId(null);
    }
  }

  function openTodayFocusDetail(item: TodayFocusItem) {
    bindTodayFocusContext(item);
    setSelectedTodayFocusItem(item);
  }

  return (
    <div className="space-y-4">
      <section data-testid="dashboardL1StatusRow" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div data-testid="dashboardMarketGateCard" className={`rounded-md border p-3 ${gateClass(marketGate)}`}>
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.marketGate")}</p>
          <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
            <MarketGateIcon className="h-4 w-4" />
            {marketGate.toUpperCase()}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface/80 p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.openSignals")}</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{signals.length}</p>
        </div>
        <div className="rounded-md border border-border bg-surface/80 p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.invalidated")}</p>
          <p className="mt-2 text-lg font-semibold text-warning tabular-nums">{invalidatedSignals}</p>
        </div>
        <div className="rounded-md border border-success/40 bg-success/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.dataFreshness")}</p>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t("dashboard.mockLive")}
          </div>
        </div>
      </section>

      <section data-testid="dashboardL2MarketIntentSummary" className="rounded-md border border-border bg-surface/80 p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">
                  {t("dashboard.marketIntentExplanation")}
                </p>
                <h2 className="mt-1 text-base font-semibold">{marketIntentExplanation?.summary}</h2>
              </div>
              <span className={`rounded border px-2 py-1 text-xs font-medium uppercase ${gateClass(marketGate)}`}>
                {marketGate}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded border border-success/30 bg-success/10 p-3">
                <p className="font-medium text-success">{t("dashboard.whyNow")}</p>
                <ul className="mt-2 space-y-1 text-muted">
                  {marketIntentExplanation?.whyNow.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="rounded border border-warning/30 bg-warning/10 p-3">
                <p className="font-medium text-warning">{t("dashboard.whyWait")}</p>
                <ul className="mt-2 space-y-1 text-muted">
                  {marketIntentExplanation?.whyWait.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">
                {t("dashboard.relatedEvidence")}: {marketIntentExplanation?.evidenceCount ?? 0}{" "}
                {t("dashboard.evidenceCount")}
              </span>
              {marketIntentExplanation?.evidenceLabels.slice(0, 3).map((label) => (
                <span key={label} className="rounded border border-border px-2 py-1 text-muted">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <MockMarketChart />
        </div>
      </section>

      <section data-testid="dashboardL3TodayFocusQueue" className="rounded-md border border-border bg-surface/80">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.todayFocusKicker")}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{t("dashboard.todayFocusTitle")}</h2>
            <div data-testid="dashboardTodayFocusPagination" className="flex items-center gap-2 text-xs text-muted">
              <span>
                {t("dashboard.todayFocusShowing", {
                  start: showingStart,
                  end: showingEnd,
                  total: totalTodayFocus,
                })}
              </span>
              <button
                type="button"
                onClick={() => setTodayFocusPage((page) => Math.max(1, page - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("dashboard.todayFocusPrev")}
              </button>
              <button
                type="button"
                onClick={() => setTodayFocusPage((page) => Math.min(maxPage, page + 1))}
                disabled={currentPage >= maxPage}
                className="rounded border border-border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("dashboard.todayFocusNext")}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <label data-testid="dashboardTodayFocusSearch" className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
            <Search className="h-4 w-4 text-muted" />
            <input
              value={todayFocusQuery}
              onChange={(event) => {
                setTodayFocusQuery(event.target.value);
                resetFocusPage();
              }}
              placeholder={t("dashboard.todayFocusSearchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>

          <div data-testid="dashboardTodayFocusTypeFilters" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTodayFocusType("all");
                resetFocusPage();
              }}
              className={`rounded border px-2 py-1 text-xs ${todayFocusType === "all" ? "border-accent text-accent" : "border-border text-muted"}`}
            >
              {t("dashboard.todayFocusAllTypes")}
            </button>
            {todayFocusTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setTodayFocusType(type);
                  resetFocusPage();
                }}
                className={`rounded border px-2 py-1 text-xs ${todayFocusType === type ? "border-accent text-accent" : "border-border text-muted"}`}
              >
                {t(todayFocusTypeLabels[type])}
              </button>
            ))}
          </div>

          <div data-testid="dashboardTodayFocusStatusFilters" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setTodayFocusStatus("all");
                resetFocusPage();
              }}
              className={`rounded border px-2 py-1 text-xs ${todayFocusStatus === "all" ? "border-accent text-accent" : "border-border text-muted"}`}
            >
              {t("dashboard.todayFocusAllStatuses")}
            </button>
            {todayFocusStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setTodayFocusStatus(status);
                  resetFocusPage();
                }}
                className={`rounded border px-2 py-1 text-xs ${todayFocusStatus === status ? "border-accent text-accent" : "border-border text-muted"}`}
              >
                {t(todayFocusStatusLabels[status])}
              </button>
            ))}
          </div>

          {todayFocusItems.length > 0 ? (
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {todayFocusItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTodayFocusDetail(item)}
                  className="block w-full bg-background/40 px-4 py-3 text-left transition hover:bg-surface-secondary/80"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded border border-accent/40 px-2 py-1 uppercase text-accent">
                      {t(todayFocusTypeLabels[item.type])}
                    </span>
                    <span className={`rounded border px-2 py-1 uppercase ${statusClass(item.status)}`}>
                      {t(todayFocusStatusLabels[item.status])}
                    </span>
                    {item.symbol ? <span className="font-semibold text-foreground">{item.symbol}</span> : null}
                    <span className="ml-auto text-muted">{t("dashboard.todayFocusInspect")}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">{item.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <CircleDotDashed className="h-3.5 w-3.5" />
                    <span>{item.reason}</span>
                    <span className="ml-auto">{t("dashboard.todayFocusTarget")}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <StateBlock title={t("dashboard.todayFocusEmptyTitle")} description={t("dashboard.todayFocusEmptyDescription")} />
          )}
        </div>
      </section>

      <div data-testid="dashboardTodayFocusDrawer">
        <Drawer>
          <Drawer.Backdrop
            isOpen={Boolean(selectedTodayFocusItem)}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                setSelectedTodayFocusItem(null);
              }
            }}
            className="bg-black/55"
          >
            <Drawer.Content placement="right">
              <Drawer.Dialog
                aria-label={t("dashboard.todayFocusDrawerTitle")}
                className="flex h-full w-full max-w-[520px] flex-col border-l border-border bg-surface text-foreground shadow-2xl shadow-black/40 sm:m-4 sm:h-[calc(100%-2rem)] sm:rounded-md sm:border"
              >
                {selectedTodayFocusItem ? (
                  <>
                    <Drawer.Header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted">
                          {t("dashboard.todayFocusDrawerTitle")}
                        </p>
                        <Drawer.Heading className="mt-1 truncate text-base font-semibold">
                          {selectedTodayFocusItem.title}
                        </Drawer.Heading>
                      </div>
                      <Drawer.CloseTrigger
                        className="rounded-md border border-border p-2 text-muted hover:text-foreground"
                        aria-label={t("dashboard.todayFocusCloseDetail")}
                      >
                        <X className="h-4 w-4" />
                      </Drawer.CloseTrigger>
                    </Drawer.Header>
                    <Drawer.Body className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Chip className="border border-accent/40 bg-transparent uppercase text-accent" size="sm">
                          {t(todayFocusTypeLabels[selectedTodayFocusItem.type])}
                        </Chip>
                        <Chip
                          className={`border bg-transparent uppercase ${statusClass(selectedTodayFocusItem.status)}`}
                          size="sm"
                        >
                          {t(todayFocusStatusLabels[selectedTodayFocusItem.status])}
                        </Chip>
                        {selectedTodayFocusItem.symbol ? (
                          <Chip className="border border-border bg-transparent font-semibold text-foreground" size="sm">
                            {selectedTodayFocusItem.symbol}
                          </Chip>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm">
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusSummary")}</p>
                          <p className="mt-2 leading-6">{selectedTodayFocusItem.summary}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusReason")}</p>
                          <p className="mt-2 leading-6">{selectedTodayFocusItem.reason}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusTags")}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedTodayFocusItem.tags.map((tag) => (
                              <Chip key={tag} className="border border-border bg-transparent text-muted" size="sm">
                                {tag}
                              </Chip>
                            ))}
                          </div>
                        </section>
                      </div>
                    </Drawer.Body>
                    <Drawer.Footer className="border-t border-border p-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-border text-muted"
                        onPress={() => setSelectedTodayFocusItem(null)}
                      >
                        {t("dashboard.todayFocusCloseDetail")}
                      </Button>
                      <Link
                        href={buildTodayFocusHref(selectedTodayFocusItem)}
                        onClick={() => bindTodayFocusContext(selectedTodayFocusItem)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {selectedTodayFocusItem.target.label} / {t("dashboard.todayFocusOpenFullDetail")}
                      </Link>
                    </Drawer.Footer>
                  </>
                ) : null}
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>
    </div>
  );
}
