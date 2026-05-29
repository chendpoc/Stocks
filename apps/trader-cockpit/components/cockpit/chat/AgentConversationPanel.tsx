"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Bot, RadioTower, Sparkles, UserRound } from "lucide-react";
import { Button, Card, Chip, ScrollShadow, TextArea } from "@heroui/react";
import { useTranslation } from "react-i18next";
import type { AgentConsoleMessage, AgentActivityNode, AgentWorkstream } from "@/lib/cockpit/adapter";

type AgentConversationPanelProps = {
  workstreams: AgentWorkstream[];
  workstream: AgentWorkstream | null;
  selectedWorkstreamId: string;
  messages: AgentConsoleMessage[];
  nodes: AgentActivityNode[];
  selectedMessageId: string | null;
  selectedNodeId: string | null;
  activePrompt: string;
  onSelectWorkstream: (workstreamId: string) => void;
  onSelectMessage: (message: AgentConsoleMessage) => void;
  onSelectNode: (nodeId: string) => void;
  onUsePrompt: (prompt: string) => void;
};

function roleIcon(role: AgentConsoleMessage["role"]) {
  if (role === "user") {
    return <UserRound className="h-4 w-4 text-muted" />;
  }
  if (role === "agent_push") {
    return <Sparkles className="h-4 w-4 text-warning" />;
  }
  return <Bot className="h-4 w-4 text-accent" />;
}

function roleClass(role: AgentConsoleMessage["role"]): string {
  if (role === "user") {
    return "border-border bg-background/70";
  }
  if (role === "agent_push") {
    return "border-warning/50 bg-warning/10";
  }
  return "border-accent/30 bg-accent/10";
}

export function AgentConversationPanel({
  workstreams,
  workstream,
  selectedWorkstreamId,
  messages,
  nodes,
  selectedMessageId,
  selectedNodeId,
  activePrompt,
  onSelectWorkstream,
  onSelectMessage,
  onSelectNode,
  onUsePrompt,
}: AgentConversationPanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(activePrompt);
  const promptSource = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0], [nodes, selectedNodeId]);
  const quickPrompts = promptSource?.askPrompts ?? [];

  useEffect(() => {
    setDraft(activePrompt);
  }, [activePrompt]);

  function handleMessageKeyDown(event: KeyboardEvent<HTMLDivElement>, message: AgentConsoleMessage) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectMessage(message);
  }

  function handleWorkstreamKeyDown(event: KeyboardEvent<HTMLButtonElement>, workstreamId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onSelectWorkstream(workstreamId);
  }

  return (
    <Card className="flex h-full min-h-0 flex-col border border-border bg-surface/80" aria-label={t("chat.conversation")}>
      <Card.Header className="block shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t("chat.conversation")}</h2>
              <p className="mt-0.5 truncate text-xs text-muted">
                {workstream ? `${workstream.title} / ${workstream.symbols.join(" / ")}` : t("chat.noWorkstream")}
              </p>
            </div>
          </div>
          {workstream ? (
            <Chip size="sm" className="border border-success/40 bg-success/10 text-success">
              {t(`chat.workstreamStatus.${workstream.status}`)}
            </Chip>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2" aria-label={t("chat.workstreamTabs")} data-testid="workstreamTabs">
          <RadioTower className="h-3.5 w-3.5 shrink-0 text-muted" />
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {workstreams.map((item) => {
              const selected = item.id === selectedWorkstreamId;

              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectWorkstream(item.id)}
                  onKeyDown={(event) => handleWorkstreamKeyDown(event, item.id)}
                  className={
                    selected
                      ? "h-7 shrink-0 border-accent/60 bg-accent/10 px-2 text-xs text-foreground"
                      : "h-7 shrink-0 border-border bg-background/70 px-2 text-xs text-muted hover:border-accent/40 hover:text-foreground"
                  }
                >
                  <span className="max-w-24 truncate">{item.title}</span>
                  {item.unreadCount > 0 ? (
                    <span className="rounded-full bg-warning px-1 py-0.5 text-[10px] font-semibold text-warning-foreground">
                      {item.unreadCount}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>
        </div>
      </Card.Header>
      <ScrollShadow className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" hideScrollBar={false}>
        {messages.map((message) => {
          const selected = message.id === selectedMessageId;

          return (
            <Card
              key={message.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectMessage(message)}
              onKeyDown={(event) => handleMessageKeyDown(event, message)}
              className={
                selected
                  ? "cursor-pointer border border-accent/70 bg-accent/10 outline-none ring-1 ring-accent/20"
                  : `cursor-pointer border outline-none hover:border-accent/40 focus:border-accent/60 ${roleClass(message.role)}`
              }
            >
              <Card.Content className="block min-w-0 p-3">
                <span className="flex items-start gap-3">
                  <span className="mt-0.5">{roleIcon(message.role)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wider text-muted">{t(`chat.messageRoles.${message.role}`)}</span>
                      <span className="text-[11px] tabular-nums text-muted">{message.createdAt}</span>
                    </span>
                    <span className="mt-2 block whitespace-normal text-sm leading-6 text-foreground">{message.text}</span>
                  </span>
                </span>
                {message.relatedNodeIds.length > 0 ? (
                  <span className="mt-3 flex flex-wrap gap-1.5 pl-7">
                    {message.relatedNodeIds.map((nodeId) => (
                      <Button
                        key={nodeId}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelectNode(nodeId);
                        }}
                        className="h-6 border-border bg-background/80 px-1.5 text-[10px] text-muted hover:border-accent/50 hover:text-foreground"
                      >
                        {nodeId}
                      </Button>
                    ))}
                  </span>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}
      </ScrollShadow>
      <Card.Footer className="block shrink-0 border-t border-border p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(prompt);
                onUsePrompt(prompt);
              }}
              className="border-border bg-background/70 text-muted hover:border-accent/50 hover:text-foreground"
            >
              {prompt}
            </Button>
          ))}
        </div>
        <div className="grid gap-2" aria-label={t("chat.promptPreview")}>
          <TextArea
            aria-label={t("chat.messageAria")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-20 rounded-md border border-border bg-background/70 px-3 py-2 text-sm text-foreground"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted">{t("chat.promptPreviewDescription")}</p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="bg-accent text-accent-foreground"
              onClick={() => onUsePrompt(draft)}
            >
              {t("chat.send")}
            </Button>
          </div>
        </div>
      </Card.Footer>
    </Card>
  );
}
