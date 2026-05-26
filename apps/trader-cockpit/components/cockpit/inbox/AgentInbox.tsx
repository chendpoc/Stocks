"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cockpitAdapter } from "@/lib/cockpit/adapter";
import type { InboxMessage } from "@/lib/cockpit/adapter";
import { cockpitKeys } from "@/lib/cockpit/query-keys";
import { StateBlock } from "@/components/cockpit/states/StateBlock";

const priorities = ["all", "action_required", "critical", "risk", "watch", "info"];

function priorityClass(priority: string) {
  if (priority === "critical" || priority === "risk") return "text-danger border-danger/40 bg-danger/10";
  if (priority === "action_required" || priority === "watch") return "text-warning border-warning/40 bg-warning/10";
  return "text-accent border-accent/40 bg-accent/10";
}

function contextImpact(message: InboxMessage) {
  return `${message.summary} ${message.objectLabel}`;
}

function relatedSignals(message: InboxMessage) {
  const [kind, signalId] = message.objectLabel.split(" ");
  if (kind !== "signal" || !signalId) {
    return [];
  }

  return [{ signalId, symbol: signalId.split("-")[2]?.toUpperCase() ?? signalId, status: message.type }];
}

export function AgentInbox({ initialEventId }: { initialEventId?: string }) {
  const { t } = useTranslation();
  const [priority, setPriority] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: cockpitKeys.inbox({ priority }),
    queryFn: () => cockpitAdapter.listInboxMessages({ priority }),
  });

  if (inboxQuery.isLoading) {
    return <StateBlock state="loading" title={t("inbox.loadingTitle")} description={t("inbox.loadingDescription")} />;
  }

  if (inboxQuery.isError) {
    return <StateBlock state="error" title={t("inbox.errorTitle")} description={t("inbox.errorDescription")} />;
  }

  const messages = inboxQuery.data?.messages ?? [];
  const requestedEventId = initialEventId ?? selectedId;
  const selected = messages.find((message) => message.id === (selectedId ?? requestedEventId)) ?? messages[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-md border border-border bg-surface/80">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("inbox.kicker")}</p>
            <h2 className="mt-1 text-sm font-semibold">{t("inbox.title")}</h2>
          </div>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            aria-label={t("inbox.filterAria")}
          >
            {priorities.map((item) => (
              <option key={item} value={item}>
                {t(`inbox.priorities.${item}`)}
              </option>
            ))}
          </select>
        </div>
        {messages.length === 0 ? (
          <div className="p-4">
            <StateBlock title={t("inbox.emptyTitle")} description={t("inbox.emptyDescription")} />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => setSelectedId(message.id)}
                className={
                  message.id === selected?.id
                    ? "w-full border-l-2 border-accent bg-surface-secondary px-4 py-3 text-left"
                    : "w-full border-l-2 border-transparent px-4 py-3 text-left hover:bg-surface-secondary/70"
                }
              >
                <InboxRow message={message} />
              </button>
            ))}
          </div>
        )}
      </section>
      <aside className="rounded-md border border-border bg-surface/80 p-4">
        {selected ? (
          <>
            <span className={`rounded border px-2 py-1 text-xs ${priorityClass(selected.priority)}`}>{selected.priority}</span>
            <h2 className="mt-4 text-lg font-semibold">{selected.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted">{selected.summary}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("inbox.eventDetail")}</p>
                <p className="mt-1">{selected.type}</p>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("inbox.contextImpact")}</p>
                <p className="mt-1">{contextImpact(selected)}</p>
              </div>
              <div className="rounded border border-border bg-background/60 p-3">
                <p className="text-xs text-muted">{t("inbox.relatedSignals")}</p>
                <div className="mt-2 space-y-1">
                  {relatedSignals(selected).map((signal) => (
                    <p key={signal.signalId} className="rounded border border-border px-2 py-1 text-xs text-muted">
                      {signal.symbol} / {signal.status}
                    </p>
                  ))}
                  {relatedSignals(selected).length ? null : <p className="text-muted">{selected.objectLabel}</p>}
                </div>
              </div>
            </div>
          </>
        ) : (
          <StateBlock title={t("inbox.noSelectionTitle")} description={t("inbox.noSelectionDescription")} />
        )}
      </aside>
    </div>
  );
}

function InboxRow({ message }: { message: InboxMessage }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-2 md:grid-cols-[160px_1fr_130px] md:items-center">
      <div>
        <span className={`rounded border px-2 py-1 text-xs ${priorityClass(message.priority)}`}>{message.priority}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{message.title}</p>
        <p className="mt-1 truncate text-xs text-muted">{message.summary}</p>
      </div>
      <div className="text-xs text-muted md:text-right">
        <p>{message.createdAt}</p>
        <p>{message.acknowledged ? t("inbox.acknowledged") : t("inbox.unread")}</p>
      </div>
    </div>
  );
}
