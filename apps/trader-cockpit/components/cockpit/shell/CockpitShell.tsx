"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Brain,
  Bot,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Signal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MarketContextId } from "@/lib/cockpit/use-cockpit-ui-store";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { AgentChatDock } from "@/components/cockpit/chat/AgentChatDock";

const navItems = [
  { href: "/cockpit/dashboard/live", labelKey: "nav.live", icon: Gauge },
  { href: "/cockpit/signals", labelKey: "nav.signals", icon: Signal },
  { href: "/cockpit/chat", labelKey: "nav.chat", icon: MessageSquare },
  { href: "/cockpit/inbox", labelKey: "nav.inbox", icon: Bell },
  { href: "/cockpit/playbook-theories", labelKey: "nav.theories", icon: BookOpen },
  { href: "/cockpit/learning", labelKey: "nav.learning", icon: Brain },
  { href: "/cockpit/settings", labelKey: "nav.settings", icon: SlidersHorizontal },
];

const contextSwitcherOptions: {
  id: MarketContextId;
  title: string;
  detail: string;
  tags: string[];
}[] = [
  {
    id: "core-watchlist",
    title: "Core Watchlist · SPY",
    detail: "核心股票池 · SPY, QQQ, AAPL, NVDA",
    tags: ["SPY", "QQQ", "AAPL", "NVDA"],
  },
  {
    id: "options-flow",
    title: "期权链观察 · SPY/QQQ",
    detail: "期权到期日 · 波动率 · Put/Call",
    tags: ["SPY", "QQQ", "Put/Call"],
  },
  {
    id: "macro-events",
    title: "宏观事件观察 · FOMC/Jobs/Inflation",
    detail: "新闻与宏观事件 · 只读",
    tags: ["FOMC", "Jobs", "Inflation"],
  },
];

const readOnlyRuntimePill = [
  { key: "runtimeData", label: "Data", state: "mock local" },
  { key: "runtimeAgent", label: "Agent", state: "observing" },
  { key: "runtimeWrite", label: "Write", state: "blocked" },
  { key: "runtimeDisplay", label: "Display", state: "read only" },
] as const;

export function CockpitShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const navCollapsed = useCockpitUiStore((state) => state.navCollapsed);
  const setNavCollapsed = useCockpitUiStore((state) => state.setNavCollapsed);
  const connectionState = useCockpitUiStore((state) => state.connectionState);
  const selectedMarketContextId = useCockpitUiStore((state) => state.selectedMarketContextId);
  const setSelectedMarketContextId = useCockpitUiStore((state) => state.setSelectedMarketContextId);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const selectedContext =
    contextSwitcherOptions.find((option) => option.id === selectedMarketContextId) ?? contextSwitcherOptions[0];
  const optimisticPathname = pendingHref ?? pathname;
  const routePending = Boolean(pendingHref && pendingHref !== pathname);

  useEffect(() => {
    if (pendingHref === pathname) {
      setPendingHref(null);
    }
  }, [pathname, pendingHref]);

  return (
    <div className="grid h-dvh min-h-0 grid-cols-[auto_1fr] overflow-hidden bg-background text-foreground">
        <aside
          className={
            navCollapsed
              ? "h-dvh w-16 overflow-y-auto border-r border-border bg-surface/70"
              : "h-dvh w-72 overflow-y-auto border-r border-border bg-surface/70"
          }
        >
          {navCollapsed ? null : (
            <div className="border-b border-border p-3">
              <div data-testid="cockpitIdentityBlock" className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t("brand.agentMarketCockpit")}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{t("brand.marketObservation")} · {t("brand.personalQuant")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNavCollapsed(true)}
                  className="rounded-md border border-border p-2 text-muted hover:text-foreground"
                  aria-label={t("shell.collapse")}
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div data-testid="cockpitContextSwitcher" className="group relative">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-success/50 bg-background/70 px-3 py-2 text-left"
                  aria-label={t("shell.contextSwitcher")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {selectedContext.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{selectedContext.detail}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                </button>
                <div className="invisible absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-md border border-border bg-surface p-2 opacity-0 shadow-xl shadow-black/30 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <p className="px-2 pb-2 text-[10px] uppercase tracking-wider text-muted">{t("shell.contextSwitcher")}</p>
                  {contextSwitcherOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedMarketContextId(option.id)}
                      className={
                        option.id === selectedMarketContextId
                          ? "w-full rounded border border-accent/40 bg-accent/10 px-2 py-2 text-left"
                          : "w-full rounded border border-transparent px-2 py-2 text-left hover:bg-surface-secondary"
                      }
                    >
                      <span className="block text-xs font-medium">{option.title}</span>
                      <span className="mt-1 block text-[11px] text-muted">{option.detail}</span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        {option.tags.map((tag) => (
                          <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">
                            {tag}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div
                data-testid="cockpitRuntimeStrip"
                className="mt-3 flex items-center gap-2 text-xs text-muted"
                aria-label={t("shell.runtimeStatus")}
              >
                <span className="h-2 w-2 rounded-full bg-success" />
                <span>{connectionState.toUpperCase()}</span>
                <span>·</span>
                <span>Mock local</span>
                <span>·</span>
                <span>{t("shell.agentObserving")}</span>
              </div>
            </div>
          )}
          {navCollapsed ? (
            <div className="border-b border-border p-2">
              <button
                type="button"
                onClick={() => setNavCollapsed(false)}
                className="rounded-md border border-border p-2 text-muted hover:text-foreground"
                aria-label={t("shell.expand")}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <nav className="flex flex-col gap-1 p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = optimisticPathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => {
                    if (item.href !== pathname) {
                      setPendingHref(item.href);
                    }
                  }}
                  className={
                    active
                      ? "flex items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                      : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {navCollapsed ? null : <span>{t(item.labelKey)}</span>}
                </Link>
              );
            })}
          </nav>
          {navCollapsed ? null : (
            <div data-testid="cockpitRuntimeStatus" className="border-t border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Cpu className="h-3.5 w-3.5" />
                <span>{t("shell.runtimeStatus")}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {readOnlyRuntimePill.map((item) => (
                  <div key={item.key} className="rounded border border-border bg-background/60 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted">{item.label}</p>
                    <p className="truncate text-[11px] text-foreground">{t(`shell.${item.key}`)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5 text-[11px] text-muted">
                <div className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
                  <Database className="h-3.5 w-3.5 text-accent" />
                  <span>SQLite FTS5 · {t("shell.readOnlyRuntime")}</span>
                </div>
                <div className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
                  <Bot className="h-3.5 w-3.5 text-success" />
                  <span>Agent Mock response</span>
                </div>
                <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-warning">
                  Provider DeepSeek available · configured inactive
                </div>
              </div>
            </div>
          )}
        </aside>
        <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden p-4" aria-busy={routePending}>
          {routePending ? (
            <div
              data-testid="cockpitRouteLoading"
              className="pointer-events-none absolute inset-x-4 top-3 z-40 flex items-center justify-center"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs text-muted shadow-lg shadow-black/20">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                {t("shell.routeLoading")}
              </span>
            </div>
          ) : null}
          {children}
        </main>
      <AgentChatDock />
    </div>
  );
}
