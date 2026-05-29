"use client";

import { Button, Input, Table } from "@heroui/react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SignalSummary } from "@/lib/cockpit/adapter";
import { riskClass, signalStatusClass } from "@/lib/cockpit/style-utils";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { CockpitSelect } from "@/components/cockpit/ui/CockpitSelect";

const signalStatuses = [
  "all",
  "watching",
  "waiting_trigger",
  "near_trigger",
  "triggered_for_attention",
  "invalidated",
  "needs_more_evidence",
] as const;

type DashboardSignalsQueueProps = {
  signals: SignalSummary[];
  total: number;
  currentPage: number;
  pageSize: number;
  status: string;
  query: string;
  isLoading?: boolean;
  onStatusChange: (status: string) => void;
  onQueryChange: (query: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onSelectSignal: (signal: SignalSummary) => void;
};

export function DashboardSignalsQueue({
  signals,
  total,
  currentPage,
  pageSize,
  status,
  query,
  isLoading = false,
  onStatusChange,
  onQueryChange,
  onPrevPage,
  onNextPage,
  onSelectSignal,
}: DashboardSignalsQueueProps) {
  const { t } = useTranslation();
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const showingStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingEnd = total === 0 ? 0 : Math.min(total, showingStart + signals.length - 1);

  return (
    <section
      data-testid="dashboardSignalsQueue"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface/80"
    >
      <div className="shrink-0 border-b border-border px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("dashboard.signalsQueueKicker")}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("dashboard.signalsQueueTitle")}</h2>
            <p className="mt-1 text-xs text-muted">{t("dashboard.signalsQueueDescription")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{t("dashboard.todayFocusShowing", { start: showingStart, end: showingEnd, total })}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrevPage}
              isDisabled={currentPage <= 1}
              className="border-border text-foreground"
            >
              {t("dashboard.todayFocusPrev")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNextPage}
              isDisabled={currentPage >= maxPage}
              className="border-border text-foreground"
            >
              {t("dashboard.todayFocusNext")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="grid shrink-0 gap-2 lg:grid-cols-[minmax(220px,1fr)_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t("dashboard.signalsQueueSearchPlaceholder")}
              autoComplete="off"
              name="signals-queue-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("dashboard.signalsQueueSearchPlaceholder")}
              className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 text-sm text-foreground placeholder:text-muted"
            />
          </div>
          <CockpitSelect
            ariaLabel={t("signals.statusFilter")}
            value={status}
            options={signalStatuses.map((item) => ({ value: item, label: item }))}
            onChange={onStatusChange}
          />
        </div>

        {isLoading ? (
          <StateBlock
            state="loading"
            title={t("dashboard.signalsQueueLoadingTitle")}
            description={t("dashboard.signalsQueueLoadingDescription")}
          />
        ) : signals.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <Table className="min-h-0 flex-1">
              <Table.ScrollContainer className="h-full overflow-x-auto">
                <Table.Content className="min-w-[920px]" aria-label={t("dashboard.signalsQueueTitle")}>
                  <Table.Header>
                    <Table.Column isRowHeader>{t("signals.ticker")}</Table.Column>
                    <Table.Column>{t("common.timeframe")}</Table.Column>
                    <Table.Column>{t("common.setup")}</Table.Column>
                    <Table.Column>{t("common.score")}</Table.Column>
                    <Table.Column>{t("common.status")}</Table.Column>
                    <Table.Column>{t("common.gate")}</Table.Column>
                    <Table.Column>{t("common.updated")}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {signals.map((signal) => (
                      <Table.Row
                        key={signal.id}
                        onClick={() => onSelectSignal(signal)}
                        className="cursor-pointer border-l-2 border-transparent bg-background/40 hover:border-accent hover:bg-surface-secondary/80"
                      >
                        <Table.Cell className="font-semibold">{signal.symbol}</Table.Cell>
                        <Table.Cell>{signal.timeframe}</Table.Cell>
                        <Table.Cell>{signal.setup}</Table.Cell>
                        <Table.Cell className="tabular-nums">{signal.score}</Table.Cell>
                        <Table.Cell>
                          <span className={`rounded border px-2 py-1 text-[11px] uppercase ${signalStatusClass(signal.status)}`}>
                            {signal.status}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          <span className={riskClass(signal.marketGate)}>{signal.marketGate}</span>
                        </Table.Cell>
                        <Table.Cell className="tabular-nums text-muted">{signal.updatedAt}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        ) : (
          <StateBlock
            title={t("dashboard.signalsQueueEmptyTitle")}
            description={t("dashboard.signalsQueueEmptyDescription")}
          />
        )}
      </div>
    </section>
  );
}
