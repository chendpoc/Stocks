"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LearningItem } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { confidenceClass } from "@/lib/cockpit/style-utils";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

function reviewDetail(item: LearningItem) {
  return {
    planVsOutcome: `${item.summary} / ${item.createdAt}`,
    hitMissAnalysis: item.confidence === "low" ? "Low-confidence candidate: evidence is not clean enough." : "Post-validation item: evidence is usable for comparison.",
    lessonLearned: item.tags.includes("post_validation") ? "Keep failed cases visible for later rule comparison." : "Do not promote a candidate until evidence freshness improves.",
    ruleImprovement: item.tags.join(" / "),
  };
}

export function LearningWorkspace({ initialReviewId }: { initialReviewId?: string }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const requestedReviewId = initialReviewId ?? selectedId;
  const selectedItem = items.find((item) => item.id === (selectedId ?? requestedReviewId)) ?? items[0];

  if (!learningQuery.data?.hasMeaningfulNewLearning || items.length === 0) {
    return (
      <StateBlock
        title={t("learning.emptyTitle")}
        description={t("learning.emptyDescription")}
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-md border border-border bg-surface/80 p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted">{t("learning.kicker")}</p>
        <h2 className="mt-1 text-lg font-semibold">{t("learning.title")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          {t("learning.description")}
        </p>
        <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedId(item.id)}
            className={
              item.id === selectedItem?.id
                ? "rounded-md border border-accent bg-surface-secondary p-4 text-left"
                : "rounded-md border border-border bg-background/60 p-4 text-left hover:bg-surface-secondary/70"
            }
          >
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
          </button>
        ))}
        </div>
      </section>
      <section className="rounded-md border border-border bg-surface/80 p-4">
        {selectedItem ? <LearningDetail item={selectedItem} /> : null}
      </section>
    </div>
  );
}

function LearningDetail({ item }: { item: LearningItem }) {
  const { t } = useTranslation();
  const detail = reviewDetail(item);

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{item.type}</p>
      <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{item.summary}</p>
      <div className="mt-4 grid gap-3 text-sm">
        <DetailBlock label={t("learning.planVsOutcome")} value={detail.planVsOutcome} />
        <DetailBlock label={t("learning.hitMissAnalysis")} value={detail.hitMissAnalysis} />
        <DetailBlock label={t("learning.lessonLearned")} value={detail.lessonLearned} />
        <DetailBlock label={t("learning.ruleImprovement")} value={detail.ruleImprovement} />
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
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 leading-6">{value}</p>
    </div>
  );
}
