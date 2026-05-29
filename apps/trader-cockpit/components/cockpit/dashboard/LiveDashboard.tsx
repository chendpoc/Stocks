"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter, type SignalSummary, type TodayFocusItem } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { focusStatusClass, priorityClass, priorityLabel } from "@/lib/cockpit/style-utils";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardStatusCards } from "./DashboardStatusCards";
import { DashboardMarketIntentStrip } from "./DashboardMarketIntentStrip";
import { DashboardSignalsQueue } from "./DashboardSignalsQueue";
import { DashboardTodayFocus, type TodayFocusColumn } from "./DashboardTodayFocus";

const queuePageSize = 5;

type QueueLens = "all" | "top-watchlist" | "top-opportunities" | "next-watch";
const queueLensTypes: Record<Exclude<QueueLens, "all">, TodayFocusItem["type"]> = {
  "top-watchlist": "watchlist",
  "top-opportunities": "opportunity",
  "next-watch": "next_watch",
};

export function LiveDashboard() {
  const { t } = useTranslation();
  const dataSource = useCockpitUiStore((state) => state.dataSource);
  const isRealDataSource = dataSource === "real";
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);

  const [headerSearchDraft, setHeaderSearchDraft] = useState("");

  const [todayFocusQuery, setTodayFocusQuery] = useState("");
  const deferredTodayFocusQuery = useDeferredValue(todayFocusQuery);
  const [todayFocusType, setTodayFocusType] = useState<TodayFocusItem["type"] | "all">("all");
  const [todayFocusStatus, setTodayFocusStatus] = useState<TodayFocusItem["status"] | "all">("all");
  const [activeQueueLens, setActiveQueueLens] = useState<QueueLens>("all");
  const [todayFocusPage, setTodayFocusPage] = useState(1);
  const [localFocusStates, setLocalFocusStates] = useState<Record<string, "followed" | "ignored" | undefined>>({});
  const [selectedTodayFocusItem, setSelectedTodayFocusItem] = useState<TodayFocusItem | null>(null);

  const [signalsQueueQuery, setSignalsQueueQuery] = useState("");
  const deferredSignalsQueueQuery = useDeferredValue(signalsQueueQuery);
  const [signalsQueueStatus, setSignalsQueueStatus] = useState("all");
  const [signalsQueuePage, setSignalsQueuePage] = useState(1);

  const effectiveTodayFocusType =
    activeQueueLens === "all"
      ? todayFocusType === "all"
        ? undefined
        : todayFocusType
      : queueLensTypes[activeQueueLens];

  const todayFocusFilters = useMemo(
    () => ({
      query: deferredTodayFocusQuery,
      type: effectiveTodayFocusType,
      status: todayFocusStatus === "all" ? undefined : todayFocusStatus,
      page: todayFocusPage,
      pageSize: queuePageSize,
    }),
    [deferredTodayFocusQuery, effectiveTodayFocusType, todayFocusPage, todayFocusStatus],
  );

  const signalsQueueFilters = useMemo(
    () => ({
      status: signalsQueueStatus,
      query: deferredSignalsQueueQuery.trim() || undefined,
      page: signalsQueuePage,
      pageSize: queuePageSize,
    }),
    [deferredSignalsQueueQuery, signalsQueuePage, signalsQueueStatus],
  );

  const marketSnapshotQuery = useQuery({
    queryKey: cockpitKeys.marketSnapshot(),
    queryFn: () => cockpitAdapter.getMarketSnapshot(),
    enabled: isRealDataSource,
  });
  const mockSignalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status: "all" }),
    queryFn: () => cockpitAdapter.listSignals({ status: "all" }),
    enabled: !isRealDataSource,
  });
  const marketIntentQuery = useQuery({
    queryKey: cockpitKeys.marketIntentExplanation(),
    queryFn: () => cockpitAdapter.getMarketIntentExplanation(),
  });
  const todayFocusQueryResult = useQuery({
    queryKey: cockpitKeys.todayFocus(todayFocusFilters),
    queryFn: () => cockpitAdapter.listTodayFocus(todayFocusFilters),
    enabled: !isRealDataSource,
  });
  const signalsQueueQueryResult = useQuery({
    queryKey: cockpitKeys.signals(signalsQueueFilters),
    queryFn: () => cockpitAdapter.listSignals(signalsQueueFilters),
    enabled: isRealDataSource,
  });

  const mockSignals = mockSignalsQuery.data?.signals ?? [];
  const marketIntentExplanation = marketIntentQuery.data?.explanation;
  const todayFocus = todayFocusQueryResult.data;
  const todayFocusItems = todayFocus?.items ?? [];
  const totalTodayFocus = todayFocus?.total ?? 0;
  const currentTodayFocusPage = todayFocus?.page ?? todayFocusPage;
  const todayFocusPageSize = todayFocus?.pageSize ?? queuePageSize;
  const maxTodayFocusPage = Math.max(1, Math.ceil(totalTodayFocus / todayFocusPageSize));
  const todayFocusShowingStart = totalTodayFocus === 0 ? 0 : (currentTodayFocusPage - 1) * todayFocusPageSize + 1;
  const todayFocusShowingEnd =
    totalTodayFocus === 0 ? 0 : Math.min(totalTodayFocus, todayFocusShowingStart + todayFocusItems.length - 1);

  const signalsQueue = signalsQueueQueryResult.data?.signals ?? [];
  const totalSignalsQueue = signalsQueueQueryResult.data?.total ?? 0;
  const currentSignalsQueuePage = signalsQueueQueryResult.data?.page ?? signalsQueuePage;
  const signalsQueuePageSize = signalsQueueQueryResult.data?.pageSize ?? queuePageSize;
  const maxSignalsQueuePage = Math.max(1, Math.ceil(totalSignalsQueue / signalsQueuePageSize));

  const marketGate = marketIntentExplanation?.marketGate ?? "caution";
  const MarketGateIcon = marketGate === "pass" ? CheckCircle2 : AlertTriangle;
  const signalsCount = isRealDataSource
    ? (marketSnapshotQuery.data?.openSignalCount ?? 0)
    : mockSignals.length;
  const invalidatedSignals = isRealDataSource
    ? (marketSnapshotQuery.data?.invalidatedSignalCount ?? 0)
    : mockSignals.filter((signal) => signal.status === "invalidated").length;

  const marketIntentPending = marketIntentQuery.isPending && !marketIntentQuery.data;
  const statusCardsPending = isRealDataSource
    ? (marketSnapshotQuery.isPending && !marketSnapshotQuery.data) || marketIntentPending
    : (mockSignalsQuery.isPending && !mockSignalsQuery.data) || marketIntentPending;
  const todayFocusPending = todayFocusQueryResult.isPending && !todayFocusQueryResult.data;
  const signalsQueuePending = signalsQueueQueryResult.isPending && !signalsQueueQueryResult.data;

  function commitHeaderSearch() {
    const nextQuery = headerSearchDraft.trim();
    if (isRealDataSource) {
      setSignalsQueueQuery(nextQuery);
      setSignalsQueuePage(1);
      return;
    }

    setTodayFocusQuery(nextQuery);
    setTodayFocusPage(1);
  }

  function handleRefresh() {
    if (isRealDataSource) {
      void marketSnapshotQuery.refetch();
      void signalsQueueQueryResult.refetch();
    } else {
      void mockSignalsQuery.refetch();
      void todayFocusQueryResult.refetch();
    }
    void marketIntentQuery.refetch();
  }

  function bindTodayFocusContext(item: TodayFocusItem) {
    if (item.symbol) setSelectedSymbol(item.symbol);
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
    setLocalFocusStates((current) => ({ ...current, [item.id]: state }));
  }

  function localFocusStateLabel(item: TodayFocusItem): string | null {
    const state = localFocusStates[item.id];
    if (state === "followed") return t("dashboard.todayFocusLocalFollowed");
    if (state === "ignored") return t("dashboard.todayFocusLocalIgnored");
    return null;
  }

  function selectSignal(signal: SignalSummary) {
    setSelectedSignalId(signal.id);
    setSelectedSymbol(signal.symbol);
  }

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
        <span className={`rounded border px-2 py-1 text-[11px] uppercase ${focusStatusClass(item.status)}`}>
          {t(`dashboard.todayFocusStatuses.${item.status}`)}
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
          <span className="block truncate font-medium text-foreground" title={item.title}>{item.title}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted" title={item.summary}>{item.summary}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: t("dashboard.focusColumnReason"),
      render: (item) => (
        <span className="block max-w-[320px] line-clamp-2 text-xs leading-5 text-muted" title={item.reason}>{item.reason}</span>
      ),
    },
    {
      key: "localState",
      header: t("dashboard.focusColumnLocalState"),
      render: (item) => {
        const label = localFocusStateLabel(item);
        return label ? (
          <span className="rounded border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success">{label}</span>
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
          <Button type="button" variant="outline" size="sm" className="border-accent/40 text-accent"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); openTodayFocusDetail(item); }}>
            {t("dashboard.todayFocusInspect")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-success/40 text-success"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLocalFocusState(item, "followed"); }}>
            {t("dashboard.todayFocusLocalFollow")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-border text-muted"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLocalFocusState(item, "ignored"); }}>
            {t("dashboard.todayFocusLocalIgnore")}
          </Button>
        </div>
      ),
    },
  ];

  const statusCardsError = isRealDataSource ? marketSnapshotQuery.isError : mockSignalsQuery.isError;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <DashboardHeader
        headerSearchDraft={headerSearchDraft}
        onHeaderSearchDraftChange={setHeaderSearchDraft}
        onCommitSearch={commitHeaderSearch}
        onRefresh={handleRefresh}
      />

      {statusCardsError ? (
        <StateBlock
          state="error"
          title={t("dashboard.errorTitle")}
          description={t("dashboard.errorDescription")}
        />
      ) : (
        <DashboardStatusCards
          marketGate={marketGate}
          MarketGateIcon={MarketGateIcon}
          signalsCount={signalsCount}
          invalidatedCount={invalidatedSignals}
          isLoading={statusCardsPending}
        />
      )}

      {marketIntentQuery.isError ? (
        <StateBlock
          state="error"
          title={t("dashboard.errorTitle")}
          description={t("dashboard.errorDescription")}
        />
      ) : (
        <DashboardMarketIntentStrip
          marketGate={marketGate}
          MarketGateIcon={MarketGateIcon}
          explanation={marketIntentExplanation}
          isLoading={marketIntentPending}
        />
      )}

      {isRealDataSource ? (
        signalsQueueQueryResult.isError ? (
          <StateBlock
            state="error"
            title={t("dashboard.errorTitle")}
            description={t("dashboard.errorDescription")}
          />
        ) : (
          <DashboardSignalsQueue
            signals={signalsQueue}
            total={totalSignalsQueue}
            currentPage={currentSignalsQueuePage}
            pageSize={signalsQueuePageSize}
            status={signalsQueueStatus}
            query={signalsQueueQuery}
            isLoading={signalsQueuePending}
            onStatusChange={(value) => {
              setSignalsQueueStatus(value);
              setSignalsQueuePage(1);
            }}
            onQueryChange={(value) => {
              setSignalsQueueQuery(value);
              setSignalsQueuePage(1);
            }}
            onPrevPage={() => setSignalsQueuePage((page) => Math.max(1, page - 1))}
            onNextPage={() => setSignalsQueuePage((page) => Math.min(maxSignalsQueuePage, page + 1))}
            onSelectSignal={selectSignal}
          />
        )
      ) : todayFocusQueryResult.isError ? (
        <StateBlock
          state="error"
          title={t("dashboard.errorTitle")}
          description={t("dashboard.errorDescription")}
        />
      ) : (
        <DashboardTodayFocus
          isLoading={todayFocusPending}
          items={todayFocusItems}
          total={totalTodayFocus}
          currentPage={currentTodayFocusPage}
          pageSize={todayFocusPageSize}
          query={todayFocusQuery}
          onQueryChange={(value) => { setTodayFocusQuery(value); setTodayFocusPage(1); }}
          type={todayFocusType}
          onTypeChange={(value) => { setTodayFocusType(value); setTodayFocusPage(1); }}
          status={todayFocusStatus}
          onStatusChange={(value) => { setTodayFocusStatus(value); setTodayFocusPage(1); }}
          activeQueueLens={activeQueueLens}
          onQueueLensChange={(lens) => { setActiveQueueLens(lens); setTodayFocusType("all"); setTodayFocusPage(1); }}
          typeFilterDisabled={activeQueueLens !== "all"}
          onPrevPage={() => setTodayFocusPage((page) => Math.max(1, page - 1))}
          onNextPage={() => setTodayFocusPage((page) => Math.min(maxTodayFocusPage, page + 1))}
          canPrev={currentTodayFocusPage > 1}
          canNext={currentTodayFocusPage < maxTodayFocusPage}
          showingStart={todayFocusShowingStart}
          showingEnd={todayFocusShowingEnd}
          selectedItem={selectedTodayFocusItem}
          onOpenDetail={openTodayFocusDetail}
          onCloseDetail={() => setSelectedTodayFocusItem(null)}
          localFocusStateLabel={localFocusStateLabel}
          onLocalFocusState={setLocalFocusState}
          columns={todayFocusColumns}
        />
      )}
    </div>
  );
}
