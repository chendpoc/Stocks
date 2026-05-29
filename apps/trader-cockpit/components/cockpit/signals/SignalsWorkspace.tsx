"use client";

import { Chip, Table } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CockpitTag, SignalStatus, SignalSummary } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { signalStatusClass, riskClass, tagClass } from "@/lib/cockpit/style-utils";
import { StateBlock } from "@/components/cockpit/states/StateBlock";
import { CockpitSelect } from "@/components/cockpit/ui/CockpitSelect";

type SignalColumn = {
  key: string;
  header: string;
  render: (signal: SignalSummary) => ReactNode;
};

export function SignalsWorkspace({ initialSignalId }: { initialSignalId?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("all");
  const [activeSignalId, setActiveSignalId] = useState<string | null>(initialSignalId ?? null);
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const setSelectedSignalId = useCockpitUiStore((state) => state.setSelectedSignalId);
  const setSelectedSymbol = useCockpitUiStore((state) => state.setSelectedSymbol);

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status }),
    queryFn: () => cockpitAdapter.listSignals({ status }),
  });
  const signals = signalsQuery.data?.signals ?? [];
  const effectiveSignalId = activeSignalId ?? selectedSignalId ?? signals[0]?.id ?? null;
  const detailQuery = useQuery({
    queryKey: cockpitKeys.signal(effectiveSignalId ?? "none"),
    queryFn: () => {
      if (!effectiveSignalId) {
        throw new Error("Signal detail query requires a selected or fallback signal id.");
      }

      return cockpitAdapter.getSignal({ id: effectiveSignalId });
    },
    enabled: Boolean(effectiveSignalId),
  });
  const selectedSignalKeys = useMemo(
    () => (effectiveSignalId ? new Set([effectiveSignalId]) : new Set<string>()),
    [effectiveSignalId],
  );

  useEffect(() => {
    if (initialSignalId) {
      setActiveSignalId(initialSignalId);
    }
  }, [initialSignalId]);

  useEffect(() => {
    if (!detailQuery.data) {
      return;
    }

    setSelectedSignalId(detailQuery.data.id);
    setSelectedSymbol(detailQuery.data.symbol);
  }, [detailQuery.data, setSelectedSignalId, setSelectedSymbol]);

  const columns = useMemo<SignalColumn[]>(
    () => [
      { key: "symbol", header: t("signals.ticker"), render: (signal) => signal.symbol },
      { key: "timeframe", header: t("common.timeframe"), render: (signal) => signal.timeframe },
      { key: "setup", header: t("common.setup"), render: (signal) => signal.setup },
      {
        key: "score",
        header: t("common.score"),
        render: (signal) => <span className="tabular-nums">{signal.score}</span>,
      },
      {
        key: "status",
        header: t("common.status"),
        render: (signal) => (
          <span className={`rounded border px-1.5 py-0.5 text-[11px] ${signalStatusClass(signal.status)}`}>
            {signal.status}
          </span>
        ),
      },
      {
        key: "tags",
        header: t("common.tags"),
        render: (signal) => (
          <div className="flex flex-nowrap gap-1">
            {signal.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={`rounded border px-1.5 py-0.5 text-[11px] ${tagClass(tag)}`}>
                {tag}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "marketGate",
        header: t("common.gate"),
        render: (signal) => <span className={riskClass(signal.marketGate)}>{signal.marketGate}</span>,
      },
      {
        key: "traderMatch",
        header: t("signals.trader"),
        render: (signal) => <span className="tabular-nums">{Math.round(signal.traderMatch * 100)}%</span>,
      },
      { key: "nextWatch", header: t("common.nextWatch"), render: (signal) => signal.nextWatch },
      { key: "updatedAt", header: t("common.updated"), render: (signal) => signal.updatedAt },
    ],
    [t],
  );

  function selectSignal(signalId: string) {
    const signal = signals.find((item) => item.id === signalId);
    if (!signal) return;

    setActiveSignalId(signal.id);
    setSelectedSignalId(signal.id);
    setSelectedSymbol(signal.symbol);
  }

  if (signalsQuery.isLoading) {
    return <StateBlock state="loading" title={t("signals.loadingTitle")} description={t("signals.loadingDescription")} />;
  }

  if (signalsQuery.isError) {
    return <StateBlock state="error" title={t("signals.errorTitle")} description={t("signals.errorDescription")} />;
  }

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_420px] xl:overflow-hidden">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface/80">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("signals.workspace")}</p>
            <h2 className="mt-1 text-sm font-semibold">{t("signals.subtitle")}</h2>
          </div>
          <CockpitSelect
            ariaLabel={t("signals.statusFilter")}
            value={status}
            className="w-[220px]"
            options={["all", "watching", "waiting_trigger", "near_trigger", "triggered_for_attention", "invalidated", "needs_more_evidence"].map((item) => ({
              value: item,
              label: item,
            }))}
            onChange={setStatus}
          />
        </div>
        <Table className="min-h-0 flex-1">
          <Table.ScrollContainer className="h-full overflow-x-auto">
            <Table.Content
              className="min-w-[1120px]"
              aria-label={t("signals.workspace")}
              selectionMode="single"
              selectedKeys={selectedSignalKeys}
              onRowAction={(key) => selectSignal(String(key))}
              onSelectionChange={(keys) => {
                if (keys === "all") return;
                const nextKey = Array.from(keys)[0];
                if (nextKey) {
                  selectSignal(String(nextKey));
                }
              }}
            >
              <Table.Header>
                {columns.map((column) => (
                  <Table.Column key={column.key} className="whitespace-nowrap" isRowHeader={column.key === "symbol"}>
                    {column.header}
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body>
                {signals.map((signal) => (
                  <Table.Row
                    key={signal.id}
                    id={signal.id}
                    textValue={`${signal.symbol} ${signal.setup}`}
                    onClick={() => selectSignal(signal.id)}
                    className={
                      signal.id === effectiveSignalId
                        ? "cursor-pointer border-l-2 border-accent bg-surface-secondary"
                        : "cursor-pointer border-l-2 border-transparent hover:bg-surface-secondary/70"
                    }
                  >
                    {columns.map((column) => (
                      <Table.Cell
                        key={column.key}
                        className="whitespace-nowrap"
                        onClick={() => selectSignal(signal.id)}
                      >
                        {column.render(signal)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </section>
      <aside className="min-h-0 overflow-y-auto rounded-md border border-border bg-surface/80 p-4">
        {detailQuery.data ? (
          <>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("signals.detail")}</p>
            <h2 className="mt-1 text-lg font-semibold">
              {detailQuery.data.symbol} / {detailQuery.data.setup}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs ${signalStatusClass(detailQuery.data.status)}`}>
                {detailQuery.data.status}
              </span>
              {detailQuery.data.tags.map((tag) => (
                <Chip key={tag} size="sm" className={`border bg-transparent ${tagClass(tag)}`}>
                  {tag}
                </Chip>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{detailQuery.data.thesis}</p>
            <div className="mt-4 grid gap-3">
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("signals.triggerInvalidation")}</p>
                <p className="mt-2 text-sm">{detailQuery.data.scenarioPlan.summary}</p>
                <div className="mt-3 grid gap-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{t("common.trigger")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.entryTrigger}</p>
                    <div className="mt-2 space-y-1">
                      {detailQuery.data.scenarioPlan.triggerConditions.map((condition) => (
                        <p key={condition} className="rounded border border-danger/30 bg-danger/10 px-2 py-1 text-danger">
                          {condition}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.invalidation")}</p>
                    <p className="mt-1 text-warning">{detailQuery.data.invalidation}</p>
                    <div className="mt-2 space-y-1">
                      {detailQuery.data.scenarioPlan.invalidationConditions.map((condition) => (
                        <p key={condition} className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-warning">
                          {condition}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t("common.nextWatch")}</p>
                    <p className="mt-1 text-muted">{detailQuery.data.nextWatch}</p>
                  </div>
                </div>
              </section>
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("signals.relatedRules")}</p>
                <div className="mt-2 space-y-2">
                  {detailQuery.data.ruleHits.map((hit) => (
                    <div key={hit.ruleId} className="rounded border border-warning/40 bg-warning/10 p-2 text-xs">
                      <p className="font-medium text-warning">{hit.label}</p>
                      <p className="mt-1 text-muted">{hit.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">
                  {t("signals.evidence")} / {detailQuery.data.evidence.length}
                </p>
                <div className="mt-2 space-y-2">
                  {detailQuery.data.evidence.map((evidence) => (
                    <div key={evidence.id} className="rounded border border-border p-2 text-xs">
                      <p className="font-medium">{evidence.title}</p>
                      <p className="mt-1 text-muted">
                        {evidence.source} / {Math.round(evidence.confidence * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <StateBlock
                title={t("signals.displayOnlyTitle")}
                description={t("signals.displayOnlyDescription")}
              />
            </div>
          </>
        ) : (
          <StateBlock title={t("signals.noSelectionTitle")} description={t("signals.noSelectionDescription")} />
        )}
      </aside>
    </div>
  );
}
