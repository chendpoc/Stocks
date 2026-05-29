"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardList, MessageCircleQuestion } from "lucide-react";
import { Button, Card, ScrollShadow, TextArea } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentActivityNode, AgentWorkstream, ContextUsedSummary } from "@/lib/cockpit/adapter";

type NodeInspectorPanelProps = {
  selectedNode: AgentActivityNode | null;
  workstream: AgentWorkstream | null;
  contextUsed: ContextUsedSummary | null;
  onAskPrompt: (prompt: string) => void;
};

function ContextGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5 className="text-[11px] uppercase tracking-wider text-muted">{title}</h5>
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

export function NodeInspectorPanel({ selectedNode, workstream, contextUsed, onAskPrompt }: NodeInspectorPanelProps) {
  const { t } = useTranslation();
  const [askDraft, setAskDraft] = useState("");

  useEffect(() => {
    setAskDraft(selectedNode?.askPrompts[0] ?? "");
  }, [selectedNode]);

  function useNodePrompt(prompt: string) {
    setAskDraft(prompt);
    onAskPrompt(prompt);
  }

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-4" aria-label={t("chat.nodeInspector")}>
      <Card.Header className="mb-4 flex shrink-0 items-center gap-2 p-0">
        <ClipboardList className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">{t("chat.nodeInspector")}</h2>
      </Card.Header>
      {selectedNode ? (
        <ScrollShadow className="min-h-0 flex-1 overflow-y-auto pr-1" hideScrollBar={false}>
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] uppercase tracking-wider text-muted">{t(`chat.nodeKinds.${selectedNode.kind}`)}</p>
                <span className="text-[11px] tabular-nums text-muted">{selectedNode.createdAt}</span>
              </div>
              <h3 className="mt-1 text-base font-semibold">{selectedNode.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{selectedNode.summary}</p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted">{t("chat.evidenceBullets")}</h4>
              <ul className="mt-2 space-y-2">
                {selectedNode.evidenceBullets.map((bullet) => (
                  <li key={bullet} className="rounded border border-border bg-background/70 p-2 text-sm leading-5">
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted">{t("chat.relatedLearningRefs")}</h4>
              {selectedNode.relatedLearningRefs.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {selectedNode.relatedLearningRefs.map((ref) => (
                    <Link
                      key={ref.id}
                      href={ref.href}
                      className="block rounded border border-border bg-background/70 p-2 text-sm text-accent hover:border-accent/50"
                    >
                      {ref.title}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded border border-border bg-background/70 p-2 text-sm text-muted">
                  {t("chat.noRelatedLearning")}
                </p>
              )}
            </div>
            <div>
              <h4 className="text-[11px] uppercase tracking-wider text-muted">{t("chat.askPrompts")}</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedNode.askPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => useNodePrompt(prompt)}
                    className="h-auto border-border bg-background/70 px-2 py-1.5 text-left text-xs text-muted hover:border-accent/50 hover:text-foreground"
                  >
                    <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{prompt}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="rounded border border-border bg-background/60 p-3">
              <h4 className="text-[11px] uppercase tracking-wider text-muted">{t("chat.nodeQuestion")}</h4>
              <TextArea
                aria-label={t("chat.nodeQuestion")}
                value={askDraft}
                onChange={(event) => setAskDraft(event.target.value)}
                className="mt-2 min-h-20 rounded-md border border-border bg-surface/80 px-3 py-2 text-sm text-foreground"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs leading-5 text-muted">{t("chat.nodeQuestionDescription")}</p>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onAskPrompt(askDraft)}
                  className="bg-accent text-accent-foreground"
                >
                  {t("chat.useQuestion")}
                </Button>
              </div>
            </div>
            {contextUsed ? (
              <div className="rounded border border-border bg-background/60 p-3">
                <h4 className="text-[11px] uppercase tracking-wider text-muted">{t("chat.contextUsed")}</h4>
                <div className="mt-3 grid gap-3">
                  <ContextGroup title={t("chat.marketFacts")} items={contextUsed.marketFacts.slice(0, 3)} />
                  <ContextGroup title={t("chat.activeLearnings")} items={contextUsed.activeLearnings.slice(0, 3)} />
                  <ContextGroup title={t("chat.preferences")} items={contextUsed.preferences.slice(0, 2)} />
                </div>
              </div>
            ) : null}
          </div>
        </ScrollShadow>
      ) : (
        <ScrollShadow className="min-h-0 flex-1 overflow-y-auto pr-1" hideScrollBar={false}>
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("chat.noSelectedNodeTitle")}</p>
          <h3 className="mt-1 text-base font-semibold">{workstream?.title ?? t("chat.noWorkstream")}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            {workstream?.summary ?? t("chat.noSelectedNodeDescription")}
          </p>
        </ScrollShadow>
      )}
    </Card>
  );
}
