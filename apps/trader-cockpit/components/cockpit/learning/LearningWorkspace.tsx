"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

function confidenceClass(confidence: string) {
  if (confidence === "high") return "text-positive";
  if (confidence === "medium") return "text-warning";
  return "text-muted";
}

export function LearningWorkspace() {
  const { t } = useTranslation();
  const learningQuery = useQuery({
    queryKey: cockpitKeys.learning({ type: "all" }),
    queryFn: () => cockpitAdapter.listLearningItems({ type: "all" }),
  });

  if (learningQuery.isLoading) {
    return <StateBlock state="loading" title={t("learning.loadingTitle")} description={t("learning.loadingDescription")} />;
  }

  if (learningQuery.isError) {
    return <StateBlock state="error" title={t("learning.errorTitle")} description={t("learning.errorDescription")} />;
  }

  const items = learningQuery.data?.items ?? [];

  if (!learningQuery.data?.hasMeaningfulNewLearning || items.length === 0) {
    return (
      <StateBlock
        title={t("learning.emptyTitle")}
        description={t("learning.emptyDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border bg-card/80 p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("learning.kicker")}</p>
        <h2 className="mt-1 text-lg font-semibold">{t("learning.title")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {t("learning.description")}
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-card/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded border border-border px-2 py-1 text-xs text-muted">{item.type}</span>
              <span className={`text-xs ${confidenceClass(item.confidence)}`}>{item.confidence}</span>
            </div>
            <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded border border-border px-2 py-1 text-xs text-muted">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {item.evidence.map((evidence) => (
                <div key={evidence.id} className="rounded border border-border bg-background/60 p-2 text-xs">
                  <p className="font-medium">{evidence.title}</p>
                  <p className="mt-1 text-muted">
                    {evidence.source} / {t("common.confidence")} {Math.round(evidence.confidence * 100)}%
                  </p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
