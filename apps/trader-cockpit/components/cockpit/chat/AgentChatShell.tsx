"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, Send, Square, Wrench } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatStreamPart } from "@/lib/cockpit/adapter";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

export function ChatPart({ part }: { part: ChatStreamPart }) {
  const { t } = useTranslation();

  if (part.type === "text-delta") {
    return <p className="leading-6 text-foreground">{part.text}</p>;
  }

  if (part.type === "tool") {
    return (
      <div className="rounded-md border border-border bg-background/70 p-3 text-sm">
        <div className="flex items-center gap-2 text-accent">
          <Wrench className="h-4 w-4" />
          <span className="font-medium">{part.toolName}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted">{part.status}</span>
        </div>
        <p className="mt-2 text-muted">{part.summary}</p>
      </div>
    );
  }

  if (part.type === "source") {
    return (
      <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
        <p className="font-medium text-accent">{part.title}</p>
        <p className="mt-1 text-xs text-muted">
          {part.source} / {part.timestamp}
        </p>
      </div>
    );
  }

  if (part.type === "evidence") {
    return (
      <div className="rounded-md border border-border bg-background/70 p-3 text-sm">
        <p className="font-medium">{part.evidence.title}</p>
        <p className="mt-1 text-xs text-muted">
          {part.evidence.source} / confidence {Math.round(part.evidence.confidence * 100)}%
        </p>
      </div>
    );
  }

  if (part.type === "warning" || part.type === "error") {
    return (
      <div className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4" />
        <span>{part.type === "warning" ? part.message : part.message}</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background/70 p-3 text-xs text-muted">
      {t("common.status")} done / {part.traceId} / {part.usage}
    </div>
  );
}

export function AgentChatShell() {
  const { t } = useTranslation();
  const selectedSymbol = useCockpitUiStore((state) => state.selectedSymbol);
  const selectedSignalId = useCockpitUiStore((state) => state.selectedSignalId);
  const [input, setInput] = useState(t("chat.defaultQuestion"));
  const [parts, setParts] = useState<ChatStreamPart[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const signalsQuery = useQuery({
    queryKey: cockpitKeys.signals({ status: "all" }),
    queryFn: () => cockpitAdapter.listSignals({ status: "all" }),
  });
  const effectiveSignalId = selectedSignalId ?? signalsQuery.data?.signals[0]?.id ?? null;
  const signalQuery = useQuery({
    queryKey: cockpitKeys.signal(effectiveSignalId ?? "none"),
    queryFn: () => {
      if (!effectiveSignalId) {
        throw new Error("Signal detail query requires a selected or fallback signal id.");
      }

      return cockpitAdapter.getSignal({ id: effectiveSignalId });
    },
    enabled: Boolean(effectiveSignalId),
  });

  async function runStream(message: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setError(null);
    setParts([]);

    try {
      for await (const part of cockpitAdapter.streamChat({
        conversationId: "phase0-chat",
        message,
        context: { symbol: selectedSymbol, signalId: effectiveSignalId ?? undefined },
        signal: controller.signal,
      })) {
        setParts((current) => [...current, part]);
      }
    } catch (streamError) {
      if (streamError instanceof DOMException && streamError.name === "AbortError") {
        setParts((current) => [
          ...current,
          { id: `stop-${Date.now()}`, type: "warning", message: t("chat.mockStopped") },
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-[calc(100vh-88px)] rounded-md border border-border bg-surface/80">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("chat.title")}</p>
            <h2 className="mt-1 text-sm font-semibold">{t("chat.subtitle")}</h2>
          </div>
          <div className="flex gap-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-2 rounded-md border border-danger/50 px-3 py-1.5 text-xs text-danger"
              >
                <Square className="h-3.5 w-3.5" />
                {t("chat.stop")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runStream(input)}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("chat.retry")}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-md border border-border bg-background/70 p-3 text-sm">
            <p className="text-muted">{t("chat.context")}</p>
            <p className="mt-1">
              {selectedSymbol} / {effectiveSignalId ?? "no-signal"} / chart 5m / rulepack v0.1 mock
            </p>
          </div>
          {parts.length === 0 && !isStreaming && !error ? (
            <StateBlock
              title={t("chat.noStreamTitle")}
              description={t("chat.noStreamDescription")}
            />
          ) : null}
          {parts.map((part) => (
            <ChatPart key={part.id} part={part} />
          ))}
          {error ? (
            <StateBlock state="error" title={t("chat.streamError")} description={error} actionLabel={t("chat.retry")} onAction={() => void runStream(input)} />
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-4">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            aria-label={t("chat.messageAria")}
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {t("chat.send")}
          </button>
        </form>
      </section>
      <aside className="space-y-4">
        {signalQuery.data ? (
          <section className="rounded-md border border-border bg-surface/80 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("chat.boundSignal")}</p>
            <h3 className="mt-1 text-base font-semibold">
              {signalQuery.data.symbol} / {signalQuery.data.setup}
            </h3>
            <p className="mt-3 text-sm leading-5 text-muted">{signalQuery.data.thesis}</p>
            <div className="mt-4 space-y-2">
              {signalQuery.data.missingConditions.map((condition) => (
                <div key={condition} className="rounded border border-border bg-background/60 p-2 text-xs text-warning">
                  {condition}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <StateBlock
          title={t("chat.readOnlyBoundaryTitle")}
          description={t("chat.readOnlyBoundaryDescription")}
        />
      </aside>
    </div>
  );
}
