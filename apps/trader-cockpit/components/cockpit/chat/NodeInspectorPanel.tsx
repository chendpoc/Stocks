"use client";

import Link from "next/link";
import { ClipboardList, MessageCircleQuestion } from "lucide-react";
import { Button, Card, ScrollShadow } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentActivityNode, AgentWorkstream } from "@/lib/cockpit/adapter";

type NodeInspectorPanelProps = {
  selectedNode: AgentActivityNode | null;
  workstream: AgentWorkstream | null;
  onAskPrompt: (prompt: string) => void;
};

export function NodeInspectorPanel({ selectedNode, workstream, onAskPrompt }: NodeInspectorPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80 p-4" aria-label={t("chat.nodeInspector")}>
      <Card.Header className="mb-4 flex shrink-0 items-center gap-2 p-0">
        <ClipboardList className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">{t("chat.nodeInspector")}</h2>
      </Card.Header>
      {selectedNode ? (
        <ScrollShadow className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" hideScrollBar={false}>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t(`chat.nodeKinds.${selectedNode.kind}`)}</p>
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
                  onClick={() => onAskPrompt(prompt)}
                  className="border-border bg-background/70 text-xs text-muted hover:border-accent/50 hover:text-foreground"
                >
                  <MessageCircleQuestion className="h-3.5 w-3.5" />
                  {prompt}
                </Button>
              ))}
            </div>
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
