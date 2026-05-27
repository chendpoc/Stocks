"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button, Chip, Drawer, Input, Table, useOverlayState } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDotDashed,
  Clock3,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter, type TodayFocusItem } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { MockMarketChart } from "@/components/cockpit/charts/MockMarketChart";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { CockpitSelect } from "@/components/cockpit/ui/CockpitSelect";

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
type QueueLens = "all" | "top-watchlist" | "top-opportunities" | "next-watch";
type TodayFocusColumn = {
  key: string;
  header: string;
  render: (item: TodayFocusItem) => ReactNode;
};

const queueLensTypes: Record<Exclude<QueueLens, "all">, TodayFocusItem["type"]> = {
  "top-watchlist": "watchlist",
  "top-opportunities": "opportunity",
  "next-watch": "next_watch",
};
const queueLensOptions: { id: QueueLens; labelKey: string }[] = [
  { id: "all", labelKey: "dashboard.queueLensAll" },
  { id: "top-watchlist", labelKey: "dashboard.queueLensTopWatchlist" },
  { id: "top-opportunities", labelKey: "dashboard.queueLensTopOpportunities" },
  { id: "next-watch", labelKey: "dashboard.queueLensNextWatch" },
];
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

function priorityClass(priority: number) {
  if (priority >= 85) return "border-danger/40 bg-danger/10 text-danger";
  if (priority >= 70) return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-background/60 text-muted";
}

function priorityLabel(priority: number) {
  if (priority >= 85) return "P1";
  if (priority >= 70) return "P2";
  return "P3";
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);
  const [todayFocusQuery, setTodayFocusQuery] = useState("");
  const [headerSearchDraft, setHeaderSearchDraft] = useState("");
  const [todayFocusType, setTodayFocusType] = useState<TodayFocusItem["type"] | "all">("all");
  const [todayFocusStatus, setTodayFocusStatus] = useState<TodayFocusItem["status"] | "all">("all");
  const [activeQueueLens, setActiveQueueLens] = useState<QueueLens>("all");
  const [localFocusStates, setLocalFocusStates] = useState<Record<string, "followed" | "ignored" | undefined>>({});
  const [todayFocusPage, setTodayFocusPage] = useState(1);
  const [selectedTodayFocusItem, setSelectedTodayFocusItem] = useState<TodayFocusItem | null>(null);
  const deferredTodayFocusQuery = useDeferredValue(todayFocusQuery);
  const todayFocusDrawerState = useOverlayState({
    isOpen: Boolean(selectedTodayFocusItem),
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setSelectedTodayFocusItem(null);
      }
    },
  });

  const effectiveTodayFocusType =
    activeQueueLens === "all" ? (todayFocusType === "all" ? undefined : todayFocusType) : queueLensTypes[activeQueueLens];
  const typeFilterDisabled = activeQueueLens !== "all";

  const todayFocusFilters = useMemo(
    () => ({
      query: deferredTodayFocusQuery,
      type: effectiveTodayFocusType,
      status: todayFocusStatus === "all" ? undefined : todayFocusStatus,
      page: todayFocusPage,
      pageSize: todayFocusPageSize,
    }),
    [deferredTodayFocusQuery, effectiveTodayFocusType, todayFocusPage, todayFocusStatus],
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
  const intentWhyNowChips = marketIntentExplanation?.whyNow.slice(0, 3) ?? [];
  const intentWhyWaitChips = marketIntentExplanation?.whyWait.slice(0, 2) ?? [];
  const todayFocusTypeOptions = [
    { value: "all" as const, label: t("dashboard.todayFocusAllTypes") },
    ...todayFocusTypes.map((type) => ({ value: type, label: t(todayFocusTypeLabels[type]) })),
  ];
  const todayFocusStatusOptions = [
    { value: "all" as const, label: t("dashboard.todayFocusAllStatuses") },
    ...todayFocusStatuses.map((status) => ({ value: status, label: t(todayFocusStatusLabels[status]) })),
  ];
  const todayFocusColumns: TodayFocusColumn[] = [
      {
        key: "priority",
        header: t("dashboard.focusColumnPriority"),
        render: (item) => (
          <span className={`rounded border px-2 py-1 text-[11px] font-medium ${priorityClass(item.priority)}`}>
            {priorityLabel(item.priority)}
          </span>
        ),
      },
      {
        key: "status",
        header: t("dashboard.focusColumnStatus"),
        render: (item) => (
          <span className={`rounded border px-2 py-1 text-[11px] uppercase ${statusClass(item.status)}`}>
            {t(todayFocusStatusLabels[item.status])}
          </span>
        ),
      },
      {
        key: "symbol",
        header: t("common.symbol"),
        render: (item) => <span className="font-semibold text-foreground">{item.symbol ?? "-"}</span>,
      },
      {
        key: "title",
        header: t("dashboard.todayFocusTitle"),
        render: (item) => (
          <span className="block max-w-[300px]">
            <span className="block truncate font-medium text-foreground" title={item.title}>
              {item.title}
            </span>
            <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted" title={item.summary}>
              {item.summary}
            </span>
          </span>
        ),
      },
      {
        key: "reason",
        header: t("dashboard.focusColumnReason"),
        render: (item) => (
          <span className="block max-w-[320px] line-clamp-2 text-xs leading-5 text-muted" title={item.reason}>
            {item.reason}
          </span>
        ),
      },
      {
        key: "localState",
        header: t("dashboard.focusColumnLocalState"),
        render: (item) => {
          const label = localFocusStateLabel(item);

          return label ? (
            <span className="rounded border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success">
              {label}
            </span>
          ) : (
            <span className="text-xs text-muted">-</span>
          );
        },
      },
      {
        key: "updatedAt",
        header: t("common.updated"),
        render: (item) => <span className="tabular-nums text-muted">{item.updatedAt}</span>,
      },
      {
        key: "actions",
        header: t("dashboard.focusColumnActions"),
        render: (item) => (
          <div className="flex w-[228px] items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-accent/40 text-accent"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openTodayFocusDetail(item);
              }}
            >
              {t("dashboard.todayFocusInspect")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-success/40 text-success"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLocalFocusState(item, "followed");
              }}
            >
              {t("dashboard.todayFocusLocalFollow")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-border text-muted"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLocalFocusState(item, "ignored");
              }}
            >
              {t("dashboard.todayFocusLocalIgnore")}
            </Button>
          </div>
        ),
      },
    ];

  function resetFocusPage() {
    setTodayFocusPage(1);
  }

  function commitHeaderSearch() {
    setTodayFocusQuery(headerSearchDraft.trim());
    resetFocusPage();
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

  function setLocalFocusState(item: TodayFocusItem, state: "followed" | "ignored") {
    setLocalFocusStates((current) => ({
      ...current,
      [item.id]: state,
    }));
  }

  function localFocusStateLabel(item: TodayFocusItem) {
    const state = localFocusStates[item.id];
    if (state === "followed") return t("dashboard.todayFocusLocalFollowed");
    if (state === "ignored") return t("dashboard.todayFocusLocalIgnored");
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
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
              onClick={() => {
                void signalsQuery.refetch();
                void marketIntentQuery.refetch();
                void todayFocusQueryResult.refetch();
              }}
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
                onChange={(event) => setHeaderSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitHeaderSearch();
                  }
                }}
                className="h-10 w-full rounded-md border border-border bg-surface pl-9 text-sm text-foreground placeholder:text-muted"
                placeholder={t("dashboard.headerSearchPlaceholder")}
              />
            </div>
          </div>
        </div>
      </section>

      <section data-testid="dashboardL1StatusRow" className="shrink-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <p className="truncate text-[11px] text-muted" title={marketIntentExplanation?.summary}>
              {marketIntentExplanation?.summary}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden text-xs">
            {intentWhyNowChips.map((item) => (
              <span key={`now-${item}`} className="max-w-[220px] truncate rounded border border-success/40 bg-success/10 px-2 py-1 text-success" title={item}>
                {t("dashboard.whyNowShort")} · {item}
              </span>
            ))}
            {intentWhyWaitChips.map((item) => (
              <span key={`wait-${item}`} className="max-w-[220px] truncate rounded border border-warning/40 bg-warning/10 px-2 py-1 text-warning" title={item}>
                {t("dashboard.whyWaitShort")} · {item}
              </span>
            ))}
            <span className="max-w-[260px] truncate rounded border border-border px-2 py-1 text-muted" title={marketIntentExplanation?.nextWatchCondition}>
              {t("dashboard.nextWatchCondition")} · {marketIntentExplanation?.nextWatchCondition}
            </span>
            <span className="rounded border border-border px-2 py-1 text-muted">
              {t("dashboard.relatedEvidence")} · {marketIntentExplanation?.evidenceCount ?? 0} {t("dashboard.evidenceCount")}
            </span>
          </div>
          <div className="hidden">
            <MockMarketChart />
          </div>
        </div>
      </section>

      <section data-testid="dashboardL3TodayFocusQueue" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface/80">
        <div className="shrink-0 border-b border-border px-4 py-3">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTodayFocusPage((page) => Math.max(1, page - 1))}
                isDisabled={currentPage <= 1}
                className="border-border text-foreground"
              >
                {t("dashboard.todayFocusPrev")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTodayFocusPage((page) => Math.min(maxPage, page + 1))}
                isDisabled={currentPage >= maxPage}
                className="border-border text-foreground"
              >
                {t("dashboard.todayFocusNext")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {queueLensOptions.map((lens) => (
              <Button
                key={lens.id}
                type="button"
                variant={activeQueueLens === lens.id ? "primary" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveQueueLens(lens.id);
                  setTodayFocusType("all");
                  resetFocusPage();
                }}
                className={
                  activeQueueLens === lens.id
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border text-muted hover:bg-surface-secondary hover:text-foreground"
                }
              >
                {t(lens.labelKey)}
              </Button>
            ))}
          </div>

          <div className="grid shrink-0 gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
            <div data-testid="dashboardTodayFocusSearch" className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label={t("dashboard.todayFocusSearchPlaceholder")}
                autoComplete="off"
                name="today-focus-search"
                value={todayFocusQuery}
                onChange={(event) => {
                  setTodayFocusQuery(event.target.value);
                  resetFocusPage();
                }}
                placeholder={t("dashboard.todayFocusSearchPlaceholder")}
                className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 text-sm text-foreground placeholder:text-muted"
              />
            </div>

            <div data-testid="dashboardTodayFocusTypeFilters">
              <CockpitSelect
                ariaLabel={t("dashboard.todayFocusAllTypes")}
                value={todayFocusType}
                isDisabled={typeFilterDisabled}
                options={todayFocusTypeOptions}
                onChange={(value) => {
                  setTodayFocusType(value);
                  resetFocusPage();
                }}
              />
            </div>

            {typeFilterDisabled ? (
              <div
                data-testid="dashboardTodayFocusEffectiveLens"
                className="flex items-center rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent lg:col-span-3"
              >
                {t("dashboard.todayFocusLensActive", {
                  lens: t(queueLensOptions.find((lens) => lens.id === activeQueueLens)?.labelKey ?? "dashboard.queueLensAll"),
                })}
              </div>
            ) : null}

            <div data-testid="dashboardTodayFocusStatusFilters">
              <CockpitSelect
                ariaLabel={t("dashboard.todayFocusAllStatuses")}
                value={todayFocusStatus}
                options={todayFocusStatusOptions}
                onChange={(value) => {
                  setTodayFocusStatus(value);
                  resetFocusPage();
                }}
              />
            </div>
          </div>

          {todayFocusItems.length > 0 ? (
            <div
              data-testid="dashboardTodayFocusScrollRegion"
              className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border"
            >
              <div data-testid="dashboardTodayFocusTable" className="h-full min-h-0">
                <Table className="min-h-0 flex-1">
                  <Table.ScrollContainer className="h-full overflow-x-auto">
                    <Table.Content className="min-w-[1040px]" aria-label={t("dashboard.todayFocusTitle")}>
                      <Table.Header>
                        {todayFocusColumns.map((column) => (
                          <Table.Column
                            key={column.key}
                            className={column.key === "actions" ? "w-[228px] whitespace-nowrap" : "whitespace-nowrap"}
                            isRowHeader={column.key === "title"}
                          >
                            {column.header}
                          </Table.Column>
                        ))}
                      </Table.Header>
                      <Table.Body>
                        {todayFocusItems.map((item) => (
                          <Table.Row
                            key={item.id}
                            onClick={() => openTodayFocusDetail(item)}
                            className="cursor-pointer border-l-2 border-transparent bg-background/40 hover:border-accent hover:bg-surface-secondary/80"
                          >
                            {todayFocusColumns.map((column) => (
                              <Table.Cell key={column.key} className="whitespace-nowrap">
                                {column.render(item)}
                              </Table.Cell>
                            ))}
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </div>
            </div>
          ) : (
            <StateBlock title={t("dashboard.todayFocusEmptyTitle")} description={t("dashboard.todayFocusEmptyDescription")} />
          )}
        </div>
      </section>

      <div data-testid="dashboardTodayFocusDrawer">
        <Drawer state={todayFocusDrawerState}>
          <Drawer.Trigger aria-label={t("dashboard.todayFocusDrawerTitle")} className="hidden" />
          <Drawer.Backdrop
            className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/10"
          >
            <Drawer.Content placement="right" className="fixed bottom-0 right-0 top-16 z-50">
              <Drawer.Dialog
                aria-label={t("dashboard.todayFocusDrawerTitle")}
                className="flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface text-foreground shadow-2xl shadow-black/30 sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-md sm:border"
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
                        <div data-testid="todayFocusDrawerMeta" className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className={`rounded border px-2 py-0.5 uppercase ${statusClass(selectedTodayFocusItem.status)}`}>
                            {t(todayFocusStatusLabels[selectedTodayFocusItem.status])}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {t("dashboard.todayFocusUpdatedAt")} {selectedTodayFocusItem.updatedAt}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {selectedTodayFocusItem.target.label}
                          </span>
                        </div>
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
                        <section className="rounded-md border border-accent/30 bg-accent/10 p-3">
                          <div className="flex items-center gap-2 text-xs text-accent">
                            <CircleDotDashed className="h-3.5 w-3.5" />
                            <p>{t("dashboard.todayFocusAgentReason")}</p>
                          </div>
                          <p className="mt-2 leading-6">{selectedTodayFocusItem.reason}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusTriggerConditions")}</p>
                          <p className="mt-2 leading-6">{selectedTodayFocusItem.summary}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <div className="flex items-center gap-2 text-xs text-warning">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <p>{t("dashboard.todayFocusInvalidationConditions")}</p>
                          </div>
                          <p className="mt-2 leading-6 text-muted">{t("dashboard.todayFocusReadOnlyNote")}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusEvidence")}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedTodayFocusItem.tags.map((tag) => (
                              <Chip key={tag} className="border border-border bg-transparent text-muted" size="sm">
                                {tag}
                              </Chip>
                            ))}
                          </div>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusRelatedAgentNodes")}</p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                            <span className="rounded-full border border-border px-2 py-1">{t("dashboard.agentNodeSnapshot")}</span>
                            <span>→</span>
                            <span className="rounded-full border border-border px-2 py-1">{t("dashboard.agentNodeSignal")}</span>
                            <span>→</span>
                            <span className="rounded-full border border-success/40 px-2 py-1 text-success">
                              {t("dashboard.agentNodeCurrent")}
                            </span>
                          </div>
                        </section>
                      </div>
                    </Drawer.Body>
                    <Drawer.Footer className="grid gap-2 border-t border-border p-4">
                      <p className="text-xs text-muted">{t("dashboard.todayFocusLocalStateNote")}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border text-muted"
                          onPress={todayFocusDrawerState.close}
                        >
                          {t("dashboard.todayFocusCloseDetail")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-success/40 text-success"
                          onPress={() => setLocalFocusState(selectedTodayFocusItem, "followed")}
                        >
                          {t("dashboard.todayFocusLocalFollow")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border text-muted"
                          onPress={() => setLocalFocusState(selectedTodayFocusItem, "ignored")}
                        >
                          {t("dashboard.todayFocusLocalIgnore")}
                        </Button>
                      </div>
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
