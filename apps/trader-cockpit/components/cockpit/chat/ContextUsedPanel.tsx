"use client";

import { DatabaseZap } from "lucide-react";
import { Card, ScrollShadow } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { ContextUsedSummary } from "@/lib/cockpit/adapter";

type ContextUsedPanelProps = {
  contextUsed: ContextUsedSummary;
};

function ContextGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-muted">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="rounded border border-border bg-background/70 px-2 py-1.5 text-xs leading-5 text-muted">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContextUsedPanel({ contextUsed }: ContextUsedPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-3" aria-label={t("chat.contextUsed")}>
      <Card.Header className="mb-3 flex shrink-0 items-center justify-between p-0">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-success" />
          <h2 className="text-sm font-semibold">{t("chat.contextUsed")}</h2>
        </div>
        <span className="text-[11px] uppercase tracking-wider text-muted">{t("common.readOnly")}</span>
      </Card.Header>
      <ScrollShadow className="min-h-0 flex-1 space-y-4 overflow-y-auto" hideScrollBar={false}>
        <ContextGroup title={t("chat.marketFacts")} items={contextUsed.marketFacts} />
        <ContextGroup title={t("chat.activeLearnings")} items={contextUsed.activeLearnings} />
        <ContextGroup title={t("chat.preferences")} items={contextUsed.preferences} />
      </ScrollShadow>
    </Card>
  );
}
