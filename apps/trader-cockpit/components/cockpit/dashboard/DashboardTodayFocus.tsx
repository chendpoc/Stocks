"use client";

import type { ReactNode } from "react";
import { Button, Chip, Drawer, Input, Table, useOverlayState } from "@heroui/react";
import {
  CircleDotDashed,
  Clock3,
  Eye,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TodayFocusItem } from "@/lib/cockpit/adapter";
import { focusStatusClass } from "@/lib/cockpit/style-utils";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { CockpitSelect } from "@/components/cockpit/ui/CockpitSelect";

// ---- Constants ----

const todayFocusTypes: TodayFocusItem["type"][] = [
  "opportunity",
  "watchlist",
  "news_event",
  "rule_match",
  "next_watch",
  "outcome_review",
];

const todayFocusStatuses: TodayFocusItem["status"][] = [
  "active",
  "waiting",
  "triggered",
  "invalidated",
  "reviewed",
];

type QueueLens = "all" | "top-watchlist" | "top-opportunities" | "next-watch";

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

// ---- Types ----

export type DashboardTodayFocusProps = {
  items: TodayFocusItem[];
  total: number;
  currentPage: number;
  pageSize: number;
  query: string;
  onQueryChange: (value: string) => void;
  type: TodayFocusItem["type"] | "all";
  onTypeChange: (value: TodayFocusItem["type"] | "all") => void;
  status: TodayFocusItem["status"] | "all";
  onStatusChange: (value: TodayFocusItem["status"] | "all") => void;
  activeQueueLens: QueueLens;
  onQueueLensChange: (lens: QueueLens) => void;
  typeFilterDisabled: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  canPrev: boolean;
  canNext: boolean;
  showingStart: number;
  showingEnd: number;
  selectedItem: TodayFocusItem | null;
  onOpenDetail: (item: TodayFocusItem) => void;
  onCloseDetail: () => void;
  localFocusStateLabel: (item: TodayFocusItem) => string | null;
  onLocalFocusState: (item: TodayFocusItem, state: "followed" | "ignored") => void;
  columns: TodayFocusColumn[];
  isLoading?: boolean;
};

export type TodayFocusColumn = {
  key: string;
  header: string;
  render: (item: TodayFocusItem) => ReactNode;
};

// ---- Component ----

export function DashboardTodayFocus(props: DashboardTodayFocusProps) {
  const { t } = useTranslation();
  const {
    items,
    total,
    currentPage,
    pageSize,
    query,
    onQueryChange,
    type,
    onTypeChange,
    status,
    onStatusChange,
    activeQueueLens,
    onQueueLensChange,
    typeFilterDisabled,
    onPrevPage,
    onNextPage,
    canPrev,
    canNext,
    showingStart,
    showingEnd,
    selectedItem,
    onOpenDetail,
    onCloseDetail,
    localFocusStateLabel,
    onLocalFocusState,
    columns,
    isLoading = false,
  } = props;

  const drawerState = useOverlayState({
    isOpen: Boolean(selectedItem),
    onOpenChange: (isOpen) => {
      if (!isOpen) onCloseDetail();
    },
  });

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  const typeOptions = [
    { value: "all" as const, label: t("dashboard.todayFocusAllTypes") },
    ...todayFocusTypes.map((type) => ({ value: type, label: t(todayFocusTypeLabels[type]) })),
  ];

  const statusOptions = [
    { value: "all" as const, label: t("dashboard.todayFocusAllStatuses") },
    ...todayFocusStatuses.map((s) => ({ value: s, label: t(todayFocusStatusLabels[s]) })),
  ];

  function resetPage() {
    onPrevPage(); // no-op if at page 1
  }

  return (
    <section data-testid="dashboardL3TodayFocusQueue" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface/80">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.todayFocusKicker")}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("dashboard.todayFocusTitle")}</h2>
          <div data-testid="dashboardTodayFocusPagination" className="flex items-center gap-2 text-xs text-muted">
            <span>
              {t("dashboard.todayFocusShowing", { start: showingStart, end: showingEnd, total })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrevPage}
              isDisabled={!canPrev}
              className="border-border text-foreground"
            >
              {t("dashboard.todayFocusPrev")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNextPage}
              isDisabled={!canNext}
              className="border-border text-foreground"
            >
              {t("dashboard.todayFocusNext")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {/* Queue lens buttons */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {queueLensOptions.map((lens) => (
            <Button
              key={lens.id}
              type="button"
              variant={activeQueueLens === lens.id ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                onQueueLensChange(lens.id);
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

        {/* Filter row */}
        <div className="grid shrink-0 gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
          <div data-testid="dashboardTodayFocusSearch" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t("dashboard.todayFocusSearchPlaceholder")}
              autoComplete="off"
              name="today-focus-search"
              value={query}
              onChange={(event) => {
                onQueryChange(event.target.value);
              }}
              placeholder={t("dashboard.todayFocusSearchPlaceholder")}
              className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <div data-testid="dashboardTodayFocusTypeFilters">
            <CockpitSelect
              ariaLabel={t("dashboard.todayFocusAllTypes")}
              value={type}
              isDisabled={typeFilterDisabled}
              options={typeOptions}
              onChange={onTypeChange}
            />
          </div>
          {typeFilterDisabled ? (
            <div data-testid="dashboardTodayFocusEffectiveLens" className="flex items-center rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent lg:col-span-3">
              {t("dashboard.todayFocusLensActive", {
                lens: t(queueLensOptions.find((l) => l.id === activeQueueLens)?.labelKey ?? "dashboard.queueLensAll"),
              })}
            </div>
          ) : null}
          <div data-testid="dashboardTodayFocusStatusFilters">
            <CockpitSelect
              ariaLabel={t("dashboard.todayFocusAllStatuses")}
              value={status}
              options={statusOptions}
              onChange={onStatusChange}
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <StateBlock
            state="loading"
            title={t("dashboard.loadingTitle")}
            description={t("dashboard.loadingDescription")}
          />
        ) : items.length > 0 ? (
          <div data-testid="dashboardTodayFocusScrollRegion" className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <div data-testid="dashboardTodayFocusTable" className="h-full min-h-0">
              <Table className="min-h-0 flex-1">
                <Table.ScrollContainer className="h-full overflow-x-auto">
                  <Table.Content className="min-w-[1040px]" aria-label={t("dashboard.todayFocusTitle")}>
                    <Table.Header>
                      {columns.map((column) => (
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
                      {items.map((item) => (
                        <Table.Row
                          key={item.id}
                          onClick={() => onOpenDetail(item)}
                          className="cursor-pointer border-l-2 border-transparent bg-background/40 hover:border-accent hover:bg-surface-secondary/80"
                        >
                          {columns.map((column) => (
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

      {/* Drawer */}
      <div data-testid="dashboardTodayFocusDrawer">
        <Drawer state={drawerState}>
          <Drawer.Trigger aria-label={t("dashboard.todayFocusDrawerTitle")} className="hidden" />
          <Drawer.Backdrop className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/10">
            <Drawer.Content placement="right" className="fixed bottom-0 right-0 top-16 z-50">
              <Drawer.Dialog
                aria-label={t("dashboard.todayFocusDrawerTitle")}
                className="flex h-full w-full max-w-[560px] flex-col border-l border-border bg-surface text-foreground shadow-2xl shadow-black/30 sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-md sm:border"
              >
                {selectedItem ? (
                  <>
                    <Drawer.Header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.todayFocusDrawerTitle")}</p>
                        <Drawer.Heading className="mt-1 truncate text-base font-semibold">
                          {selectedItem.title}
                        </Drawer.Heading>
                        <div data-testid="todayFocusDrawerMeta" className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className={`rounded border px-2 py-0.5 uppercase ${focusStatusClass(selectedItem.status)}`}>
                            {t(todayFocusStatusLabels[selectedItem.status])}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {t("dashboard.todayFocusUpdatedAt")} {selectedItem.updatedAt}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {selectedItem.target.label}
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
                          {t(todayFocusTypeLabels[selectedItem.type])}
                        </Chip>
                        <Chip className={`border bg-transparent uppercase ${focusStatusClass(selectedItem.status)}`} size="sm">
                          {t(todayFocusStatusLabels[selectedItem.status])}
                        </Chip>
                        {selectedItem.symbol ? (
                          <Chip className="border border-border bg-transparent font-semibold text-foreground" size="sm">
                            {selectedItem.symbol}
                          </Chip>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <section className="rounded-md border border-accent/30 bg-accent/10 p-3">
                          <div className="flex items-center gap-2 text-xs text-accent">
                            <CircleDotDashed className="h-3.5 w-3.5" />
                            <p>{t("dashboard.todayFocusAgentReason")}</p>
                          </div>
                          <p className="mt-2 leading-6">{selectedItem.reason}</p>
                        </section>
                        <section className="rounded-md border border-border bg-background/60 p-3">
                          <p className="text-xs text-muted">{t("dashboard.todayFocusTriggerConditions")}</p>
                          <p className="mt-2 leading-6">{selectedItem.summary}</p>
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
                            {selectedItem.tags.map((tag) => (
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
                        <Button type="button" variant="outline" className="border-border text-muted" onPress={drawerState.close}>
                          {t("dashboard.todayFocusCloseDetail")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-success/40 text-success"
                          onPress={() => onLocalFocusState(selectedItem, "followed")}
                        >
                          {t("dashboard.todayFocusLocalFollow")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border text-muted"
                          onPress={() => onLocalFocusState(selectedItem, "ignored")}
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
    </section>
  );
}
