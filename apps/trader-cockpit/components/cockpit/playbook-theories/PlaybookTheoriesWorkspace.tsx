"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

function confidenceClass(confidence: string) {
  if (confidence === "high") return "text-success";
  if (confidence === "medium") return "text-warning";
  return "text-muted";
}

export function PlaybookTheoriesWorkspace({ initialTheoryId }: { initialTheoryId?: string }) {
  const { t } = useTranslation();
  const selectedTheoryId = useCockpitUiStore((state) => state.selectedTheoryId);
  const setSelectedTheoryId = useCockpitUiStore((state) => state.setSelectedTheoryId);

  const theoriesQuery = useQuery({
    queryKey: cockpitKeys.playbookTheories({ status: "all" }),
    queryFn: () => cockpitAdapter.listPlaybookTheories({ status: "all" }),
  });

  const theories = useMemo(() => theoriesQuery.data?.theories ?? [], [theoriesQuery.data?.theories]);
  const requestedTheoryId = initialTheoryId ?? selectedTheoryId;
  const selectedTheory = theories.find((theory) => theory.id === requestedTheoryId) ?? theories[0];

  useEffect(() => {
    if (selectedTheory && selectedTheory.id !== selectedTheoryId) {
      setSelectedTheoryId(selectedTheory.id);
    }
  }, [selectedTheory, selectedTheoryId, setSelectedTheoryId]);

  if (theoriesQuery.isLoading) {
    return <StateBlock state="loading" title={t("theories.loadingTitle")} description={t("theories.loadingDescription")} />;
  }

  if (theoriesQuery.isError) {
    return <StateBlock state="error" title={t("theories.errorTitle")} description={t("theories.errorDescription")} />;
  }

  if (!selectedTheory) {
    return <StateBlock title={t("theories.emptyTitle")} description={t("theories.emptyDescription")} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-md border border-border bg-surface/80">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("theories.kicker")}</p>
          <h2 className="mt-1 text-sm font-semibold">{t("theories.title")}</h2>
        </div>
        <div className="divide-y divide-border">
          {theories.map((theory) => (
            <button
              key={theory.id}
              type="button"
              onClick={() => setSelectedTheoryId(theory.id)}
              className={
                theory.id === selectedTheory.id
                  ? "w-full border-l-2 border-accent bg-surface-secondary px-4 py-3 text-left"
                  : "w-full border-l-2 border-transparent px-4 py-3 text-left hover:bg-surface-secondary/70"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{theory.name}</span>
                <span className={confidenceClass(theory.confidence)}>{theory.confidence}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{theory.thesis}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <section className="rounded-md border border-border bg-surface/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t("theories.theoryDetail")}</p>
              <h2 className="mt-1 text-lg font-semibold">{selectedTheory.name}</h2>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded border border-border px-2 py-1 text-muted">{selectedTheory.status}</span>
              <span className={`rounded border border-border px-2 py-1 ${confidenceClass(selectedTheory.confidence)}`}>
                {selectedTheory.confidence}
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">{selectedTheory.thesis}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedTheory.tags.map((tag) => (
              <span key={tag} className="rounded border border-border px-2 py-1 text-xs text-muted">
                {tag}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface/80 p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("theories.rulesArray")}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {selectedTheory.rules.map((rule) => (
              <div key={rule.id} className="rounded border border-border bg-background/60 p-3">
                <p className="text-sm font-medium">{rule.name}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{rule.condition}</p>
                <p className="mt-2 text-xs text-warning">{rule.effect}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{rule.explainText}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border bg-surface/80 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("theories.validationNotes")}</p>
            {selectedTheory.validationSummary ? (
              <p className="mt-3 text-sm leading-6 text-muted">{selectedTheory.validationSummary}</p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {selectedTheory.failureModes.map((mode) => (
                <li key={mode}>{mode}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-border bg-surface/80 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("theories.matchedSignals")}</p>
            <div className="mt-3 space-y-2">
              {selectedTheory.currentMatches.length ? (
                selectedTheory.currentMatches.map((match) => (
                  <div key={match.signalId} className="rounded border border-border bg-background/60 p-2 text-sm">
                    <span className="font-medium">{match.symbol}</span>
                    <span className="ml-2 text-xs text-muted">{match.status}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">{t("theories.noMatches")}</p>
              )}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
