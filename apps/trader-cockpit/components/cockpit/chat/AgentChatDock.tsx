"use client";

import { AlertTriangle, Maximize2, MessageSquare, Minimize2, RotateCcw, Send, Square, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatStreamPart } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { ChatPart } from "@/components/cockpit/chat/AgentChatShell";

export function AgentChatDock() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const selectedSymbol = useCockpitUiStore((state) => state.selectedSymbol);
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const chatDockMode = useCockpitUiStore((state) => state.chatDockMode);
  const setChatDockMode = useCockpitUiStore((state) => state.setChatDockMode);
  const [input, setInput] = useState(t("chat.defaultQuestion"));
  const [parts, setParts] = useState<ChatStreamPart[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const quickPrompts = [
    t("chat.quickPrompts.marketIntent"),
    t("chat.quickPrompts.waitingReason"),
    t("chat.quickPrompts.triggerInvalidation"),
  ];

  async function runStream(message: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setError(null);
    setParts([]);

    try {
      for await (const part of cockpitAdapter.streamChat({
        conversationId: "phase0-chat-dock",
        message,
        context: { symbol: selectedSymbol, signalId: selectedSignalId ?? undefined },
        signal: controller.signal,
      })) {
        setParts((current) => [...current, part]);
      }
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        setParts((current) => [
          ...current,
          { id: `dock-stop-${Date.now()}`, type: "warning", message: t("chat.mockStopped") },
        ]);
      } else {
        setError(streamError instanceof Error ? streamError.message : "Unknown stream failure");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runStream(input);
  }

  if (chatDockMode === "collapsed") {
    return (
      <button
        type="button"
        onClick={() => setChatDockMode("dock")}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent px-4 py-3 text-sm font-medium text-accent-foreground shadow-xl shadow-black/30"
        aria-label={t("chat.dockOpen")}
      >
        <MessageSquare className="h-4 w-4" />
        {t("nav.chat")}
      </button>
    );
  }

  const expanded = chatDockMode === "expanded";

  return (
    <section
      className={
        expanded
          ? "fixed inset-4 z-50 flex flex-col rounded-md border border-border bg-surface shadow-2xl shadow-black/40"
          : "fixed bottom-4 right-4 z-50 flex h-[560px] max-h-[calc(100vh-2rem)] w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-surface shadow-2xl shadow-black/40"
      }
      aria-label={t("chat.dockTitle")}
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("chat.dockTitle")}</p>
          <h2 className="truncate text-sm font-semibold">
            {selectedSymbol} / {selectedSignalId ?? t("chat.noBoundSignal")}
          </h2>
          <p className="mt-1 truncate text-[11px] text-muted">
            {t("chat.pageContext")} {pathname}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isStreaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-md border border-danger/50 p-2 text-danger"
              aria-label={t("chat.stop")}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runStream(input)}
              className="rounded-md border border-border p-2 text-muted hover:text-foreground"
              aria-label={t("chat.retry")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setChatDockMode(expanded ? "dock" : "expanded")}
            className="rounded-md border border-border p-2 text-muted hover:text-foreground"
            aria-label={expanded ? t("chat.dockMinimize") : t("chat.dockExpand")}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setChatDockMode("collapsed")}
            className="rounded-md border border-border p-2 text-muted hover:text-foreground"
            aria-label={t("chat.dockClose")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setInput(prompt);
                void runStream(prompt);
              }}
              disabled={isStreaming}
              className="rounded border border-border bg-background/70 px-2 py-1 text-xs text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {parts.length === 0 && !isStreaming && !error ? (
          <div className="rounded-md border border-border bg-background/70 p-3 text-sm text-muted">
            {t("chat.dockEmpty")}
          </div>
        ) : null}
        {parts.map((part) => (
          <ChatPart key={part.id} part={part} />
        ))}
        {error ? (
          <div className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border bg-surface p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          aria-label={t("chat.messageAria")}
        />
        <button
          type="submit"
          disabled={isStreaming}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("chat.send")}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
