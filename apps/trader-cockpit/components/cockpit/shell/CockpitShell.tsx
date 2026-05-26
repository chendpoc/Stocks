"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  Brain,
  Gauge,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  SlidersHorizontal,
  Signal,
} from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useCockpitUiStore } from "@/lib/cockpit/use-cockpit-ui-store";
import { AgentChatDock } from "@/components/cockpit/chat/AgentChatDock";

const navItems = [
  { href: "/dashboard/live", labelKey: "nav.live", icon: Gauge },
  { href: "/signals", labelKey: "nav.signals", icon: Signal },
  { href: "/inbox", labelKey: "nav.inbox", icon: Bell },
  { href: "/playbook-theories", labelKey: "nav.theories", icon: BookOpen },
  { href: "/learning", labelKey: "nav.learning", icon: Brain },
  { href: "/settings", labelKey: "nav.settings", icon: SlidersHorizontal },
];

export function CockpitShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const navCollapsed = useCockpitUiStore((state) => state.navCollapsed);
  const setNavCollapsed = useCockpitUiStore((state) => state.setNavCollapsed);
  const connectionState = useCockpitUiStore((state) => state.connectionState);
  const selectedSymbol = useCockpitUiStore((state) => state.selectedSymbol);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setNavCollapsed(!navCollapsed)}
            className="rounded-md border border-border p-2 text-muted hover:text-foreground"
            aria-label={navCollapsed ? t("shell.expand") : t("shell.collapse")}
          >
            {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted">Trader Agent Cockpit</p>
              <h1 className="truncate text-sm font-semibold">{t("brand.title")}</h1>
            </div>
            <div className="hidden min-w-64 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted md:flex">
              <Search className="h-3.5 w-3.5" />
              <span>{t("brand.search")}</span>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs tabular-nums sm:flex">
            <span className="rounded border border-warning/50 bg-warning/10 px-2 py-1 text-warning">
              {t("shell.gate")} CAUTION
            </span>
            <span className="rounded border border-border bg-card px-2 py-1 text-muted">
              {t("shell.context")} {selectedSymbol}
            </span>
            <span className="rounded border border-positive/50 bg-positive/10 px-2 py-1 text-positive">
              {connectionState.toUpperCase()}
            </span>
          </div>
        </div>
      </header>
      <div className="grid min-h-[calc(100vh-56px)] grid-cols-[auto_1fr]">
        <aside
          className={
            navCollapsed
              ? "w-16 border-r border-border bg-card/70"
              : "w-56 border-r border-border bg-card/70"
          }
        >
          <nav className="flex flex-col gap-1 p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

                  return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "flex items-center gap-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-background"
                      : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-panel hover:text-foreground"
                  }
                >
                      <Icon className="h-4 w-4 shrink-0" />
                      {navCollapsed ? null : <span>{t(item.labelKey)}</span>}
                    </Link>
                  );
            })}
          </nav>
          {navCollapsed ? null : (
            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Settings className="h-3.5 w-3.5" />
                <span>{t("shell.foundation")}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                {t("shell.foundationDescription")}
              </p>
              <div className="mt-3 rounded border border-border px-2 py-1.5 text-xs text-muted">
                {t("shell.polling")}
              </div>
            </div>
          )}
        </aside>
        <main className="min-w-0 p-4">{children}</main>
      </div>
      <AgentChatDock />
    </div>
  );
}
