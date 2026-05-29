"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MarketInterpretation, ResearchSession, ReviewRecord } from "@stock-summary/summary-core";
import {
  Bot,
  CalendarDays,
  Database,
  FileSearch,
  History,
  LayoutDashboard,
  ListFilter,
  PanelRight,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import { AgentPanel } from "./AgentPanel";
import { DataSourcePanel } from "./DataSourcePanel";
import { OpportunityBoard } from "./OpportunityBoard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";

const TAB_LABELS = {
  overview: "今日概览",
  opportunities: "机会观察",
  evidence: "证据中心",
  market: "市场解读",
  review: "复盘记录",
} as const;

const TAB_META = {
  overview: { icon: LayoutDashboard },
  opportunities: { icon: Target },
  evidence: { icon: FileSearch },
  market: { icon: TrendingUp },
  review: { icon: History },
} as const;

const AGENT_PROMPTS = [
  "基于今天的机会观察，哪些假设最需要反证？",
  "只看缺失证据，给我下一步外部数据检查清单。",
  "按市场状态、机会强弱、反证条件总结今天的观察优先级。",
];

const EVIDENCE_COMMANDS = [
  { label: "补 quote", token: "quote", tool: "yfinance_quote" },
  { label: "补 history", token: "history", tool: "yfinance_history" },
  { label: "补 alpha quote", token: "alpha", tool: "alpha_vantage_quote" },
  { label: "补 longbridge quote", token: "longbridge", tool: "longbridge_quote" },
  { label: "补 news", token: "news", tool: "news_search" },
] as const;

const REVIEW_OUTCOME_LABELS = {
  failed: "已失效",
  unclear: "未确认",
  validated: "已验证",
} as const;

type ResearchTab = keyof typeof TAB_LABELS;

type ReviewOutcomeFilter = ReviewRecord["outcome"] | "all";
type ReviewOpenContext = { source: "review-ledger"; reviewId: string };
type PendingReviewSymbol = {
  id: number;
  symbol: string;
  source?: "command-palette" | "review-ledger";
  reviewId?: string;
};

type CommandIntent = {
  agentAction: string;
  day: string;
  evidenceToken: string;
  explicitSymbol: string;
  normalizedQuery: string;
  targetSymbol: string;
};

type AgentPromptCommand = {
  id: number;
  text: string;
  source?: string;
  symbol?: string;
  promptType?: string;
  day?: string;
};

type AgentRailStatus = {
  label: string;
  tone: "idle" | "running" | "ready" | "error";
  detail: string;
  runId?: string;
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    context_loaded: "已加载上下文",
    opportunity_generated: "已生成机会",
    evidence_enriched: "已补充证据",
    watching: "观察中",
    reviewed: "已复盘",
  };
  return labels[status] ?? status;
}

function selectedDayLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    exact_ready: "资料完整",
    exact_partial: "资料缺口",
    latest_with_structured_context: "最新可用",
    latest_partial: "最新缺口",
    missing: "缺失",
    resolving: "解析中",
  };
  return labels[value ?? ""] ?? value ?? "解析中";
}

function sourceReadiness(session: ResearchSession | null) {
  const statuses = session?.contextStatus.sourceStatuses ?? [];
  const ready = statuses.filter((source) => source.available).length;
  return { ready, total: statuses.length, statuses };
}

function CockpitStatusHeader({
  day,
  session,
  readiness,
  missingEvidenceNeedCount,
  agentStatus,
}: {
  day: string;
  session: ResearchSession | null;
  readiness: ReturnType<typeof sourceReadiness>;
  missingEvidenceNeedCount: number;
  agentStatus: AgentRailStatus;
}) {
  const missingSourceCount = Math.max(readiness.total - readiness.ready, 0);
  const sourceLabel = readiness.total
    ? `${readiness.ready}/${readiness.total}`
    : "0/0";
  const sessionDay = day || session?.day || "解析中";
  const opportunityCount = session?.opportunities.length ?? 0;
  const reviewCount = session?.reviewRecords.length ?? 0;
  const dayStatus = selectedDayLabel(session?.contextStatus.selectedDayStatus);

  return (
    <section className="cockpit-status-header" aria-label="研究工作台状态">
      <div className="cockpit-status-primary">
        <span>当前研究日</span>
        <strong>{sessionDay}</strong>
        <Badge variant={missingSourceCount ? "warning" : "success"}>{dayStatus}</Badge>
      </div>
      <div className="cockpit-status-metrics">
        <article className="cockpit-status-card" data-status-tone={missingSourceCount ? "warning" : "ready"}>
          <span>资料完整度</span>
          <strong>{sourceLabel}</strong>
          <small>{missingSourceCount ? `${missingSourceCount} 个来源缺失` : "资料已就绪"}</small>
        </article>
        <article className="cockpit-status-card" data-status-tone={opportunityCount ? "ready" : "warning"}>
          <span>机会数量</span>
          <strong>{opportunityCount}</strong>
          <small>{session ? statusLabel(session.status) : "加载中"}</small>
        </article>
        <article className="cockpit-status-card" data-status-tone={missingEvidenceNeedCount ? "warning" : "ready"}>
          <span>证据缺口</span>
          <strong>{missingEvidenceNeedCount}</strong>
          <small>{missingEvidenceNeedCount ? "优先补证据" : "暂无必需缺口"}</small>
        </article>
        <article className="cockpit-status-card" data-status-tone={reviewCount ? "ready" : "neutral"}>
          <span>复盘记录</span>
          <strong>{reviewCount}</strong>
          <small>{reviewCount ? "已有复盘闭环" : "等待复盘"}</small>
        </article>
        <article
          className="cockpit-status-card cockpit-status-card-agent"
          data-status-tone={agentStatus.tone}
        >
          <span>Agent 状态</span>
          <strong>{agentStatus.label}</strong>
          <small>{agentStatus.runId ?? agentStatus.detail}</small>
        </article>
      </div>
    </section>
  );
}

function uniqueSymbols(session: ResearchSession | null) {
  const symbols = new Set<string>();
  for (const item of session?.sourceContext.keySymbols ?? []) {
    const symbol = item.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/)?.[0];
    if (symbol) symbols.add(symbol);
  }
  for (const opportunity of session?.opportunities ?? []) {
    for (const symbol of opportunity.symbols) symbols.add(symbol);
  }
  return [...symbols].slice(0, 18);
}

function commandMatches(value: string, query: string) {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function normalizeCommandQuery(query: string) {
  return query.trim().toLowerCase();
}

function symbolFromCommandQuery(query: string, symbols: string[]) {
  const directMatch = query.match(/@([A-Z][A-Z0-9.-]{0,9})\b/i)
    ?? query.match(/\/(?:evidence|agent)\s+\w+\s+([A-Z][A-Z0-9.-]{0,9})\b/i)
    ?? query.match(/\/?review\s+([A-Z][A-Z0-9.-]{0,9})\b/i);
  if (directMatch?.[1]) return directMatch[1].toUpperCase();

  const knownSymbols = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  const symbolTokens = query.toUpperCase().match(/\b[A-Z][A-Z0-9.-]{1,9}\b/g) ?? [];
  return symbolTokens.find((token) => knownSymbols.has(token)) ?? "";
}

function commandSymbol(query: string, fallback: string | null, symbols: string[]) {
  return (symbolFromCommandQuery(query, symbols) || fallback || symbols[0] || "GENERAL").toUpperCase();
}

function parseCommandIntent(query: string, fallback: string | null, symbols: string[]): CommandIntent {
  const normalizedQuery = normalizeCommandQuery(query);
  const evidenceToken = normalizedQuery.match(/^\/evidence(?:\s+([a-z0-9_-]+))?/)?.[1] ?? "";
  const agentAction = normalizedQuery.match(/^\/agent(?:\s+([a-z0-9_-]+))?/)?.[1] ?? "";
  const day = normalizedQuery.match(/\bday:(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? "";
  const explicitSymbol = symbolFromCommandQuery(query, symbols);
  return {
    agentAction,
    day,
    evidenceToken,
    explicitSymbol,
    normalizedQuery,
    targetSymbol: commandSymbol(query, fallback, symbols),
  };
}

function SessionSidebar({
  day,
  session,
  activeTab,
  onDayChange,
  onTabChange,
}: {
  day: string;
  session: ResearchSession | null;
  activeTab: ResearchTab;
  onDayChange: (day: string) => void;
  onTabChange: (tab: ResearchTab) => void;
}) {
  const missing = session?.contextStatus.missing ?? [];
  const availableDays = session?.contextStatus.availableDays ?? [];
  const tabEntries = Object.entries(TAB_LABELS) as Array<[ResearchTab, string]>;

  return (
    <aside className="flex min-h-screen flex-col bg-slate-950 text-slate-100" aria-label="研究会话导航">
      <div className="flex min-h-16 items-center gap-3 border-b border-slate-800 px-4">
        <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-white">R</div>
        <div>
          <strong className="block text-sm leading-tight">Research</strong>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Workbench
          </span>
        </div>
      </div>

      <nav className="grid gap-1 px-3 py-4" aria-label="研究模块">
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
          Overview
        </p>
        {tabEntries.map(([key, label]) => {
          const Icon = TAB_META[key].icon;
          const count = key === "opportunities"
            ? session?.opportunities.length
            : key === "evidence"
              ? session?.evidenceRuns.length
              : key === "review"
                ? session?.reviewRecords.length
                : undefined;
          return (
            <button
              aria-current={activeTab === key ? "page" : undefined}
              className={[
                "flex min-h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition-colors",
                activeTab === key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
              ].join(" ")}
              key={key}
              onClick={() => onTabChange(key)}
              type="button"
            >
              <span className="grid size-6 place-items-center rounded bg-white/5 text-slate-400">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              {typeof count === "number" ? (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-4 border-t border-slate-800 p-4">
        <label htmlFor="research-session-day" className="grid gap-2 text-xs font-semibold text-slate-500">
          研究日期
          <Input
            className="border-slate-800 bg-slate-900 text-slate-100"
            list="research-available-days"
            id="research-session-day"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
          />
          <datalist id="research-available-days">
            {availableDays.map((availableDay) => (
              <option key={availableDay} value={availableDay} />
            ))}
          </datalist>
        </label>
        <Card className="border-slate-800 bg-white/[0.04] text-slate-100 shadow-none">
          <CardContent className="grid gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Session</span>
              <Badge variant={missing.length ? "warning" : "success"}>
                {missing.length ? "partial" : "ready"}
              </Badge>
            </div>
            <strong>{session ? statusLabel(session.status) : "加载中"}</strong>
            <p className={missing.length ? "text-xs leading-5 text-amber-300" : "text-xs text-emerald-300"}>
              {missing.length ? `缺少：${missing.join(" / ")}` : "上下文已就绪"}
            </p>
          </CardContent>
        </Card>
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold text-slate-400">
            资料源详情
            <span className="text-slate-600 group-open:hidden">+</span>
            <span className="hidden text-slate-600 group-open:inline">-</span>
          </summary>
          <div className="mt-3">
            <DataSourcePanel />
          </div>
        </details>
      </div>
    </aside>
  );
}

function SourceReadinessSummary({ session }: { session: ResearchSession | null }) {
  const readiness = sourceReadiness(session);
  if (!readiness.total) return null;

  return (
    <details className="source-readiness-summary mb-3 rounded-lg border bg-card shadow-sm">
      <summary className="source-readiness-summary-trigger flex cursor-pointer items-center justify-between gap-4 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4 text-primary" aria-hidden="true" />
          资料状态 {readiness.ready}/{readiness.total}
        </span>
        <span className="text-xs text-muted-foreground">
          {session?.contextStatus.sourceRefs.length ?? 0} 个引用源
        </span>
      </summary>
      <div className="grid gap-2 border-t p-3 md:grid-cols-3">
        {readiness.statuses.map((source) => (
          <article
            className="min-w-0 rounded-md border bg-muted/40 p-3"
            key={source.key}
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">{source.label}</strong>
              <Badge variant={source.available ? "success" : "warning"}>
                {source.available ? "可用" : "缺失"}
              </Badge>
            </div>
            <p className="mt-2 break-all font-mono text-[11px] leading-4 text-muted-foreground">
              {source.resolvedPath ?? source.path}
            </p>
          </article>
        ))}
      </div>
    </details>
  );
}

function SessionOverview({ session }: { session: ResearchSession | null }) {
  if (!session) return <p className="cockpit-muted">正在加载研究会话。</p>;

  return (
    <section className="session-overview" aria-label="今日概览">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>管理员理论</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {session.sourceContext.adminTheory.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>市场主线</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {session.sourceContext.marketContext.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>重点标的</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {session.sourceContext.keySymbols.map((item) => (
                <Badge variant="secondary" key={item}>{item}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>风险</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              {session.sourceContext.risks.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function EvidenceCenter({ session }: { session: ResearchSession | null }) {
  const runs = session?.evidenceRuns ?? [];

  return (
    <section className="evidence-center" aria-label="证据中心">
      <div className="section-title-row">
        <h3>证据中心</h3>
        <span>{runs.length} 条记录</span>
      </div>
      {runs.length ? (
        <div className="evidence-timeline">
          {runs.map((run) => (
            <article className={`evidence-run evidence-run-${run.verdict}`} key={run.id}>
              <div>
                <strong>{run.toolName}</strong>
                <span>{run.sourceType} / {run.verdict}</span>
              </div>
              <p>{run.summary}</p>
              <small>{run.createdAt}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="cockpit-muted">还没有补充证据。请在机会详情中选择证据工具。</p>
      )}
    </section>
  );
}

function MarketInterpreter({ day }: { day: string }) {
  const [interpretation, setInterpretation] = useState<MarketInterpretation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runMarketInterpretation() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/research/market-interpretation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      if (!response.ok) throw new Error(`Market interpretation request failed: ${response.status}`);
      setInterpretation((await response.json()) as MarketInterpretation);
    } catch (rawError) {
      setError(rawError instanceof Error ? rawError.message : String(rawError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="market-interpretation" aria-label="市场解读">
      <div className="section-title-row">
        <h3>市场解读</h3>
        <Button disabled={loading} onClick={runMarketInterpretation} type="button">
          {loading ? "分析中" : "生成解读"}
        </Button>
      </div>
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      {interpretation ? (
        <div className="market-grid">
          <article>
            <h4>市场状态</h4>
            <ul>{interpretation.marketState.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h4>主线解释</h4>
            <ul>{interpretation.mainLine.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h4>标的表现</h4>
            <ul>{interpretation.symbolReadings.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h4>下一步观察</h4>
            <ul>{interpretation.nextWatch.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </div>
      ) : (
        <p className="cockpit-muted">市场解读会基于当前 session 与已保存证据生成，不会自动调用外部工具。</p>
      )}
    </section>
  );
}

function ReviewRecordsPanel({
  day,
  session,
  selectedSymbol,
  onSaved,
  onOpenOpportunity,
}: {
  day: string;
  session: ResearchSession | null;
  selectedSymbol?: string | null;
  onSaved: () => Promise<void>;
  onOpenOpportunity: (symbol: string, context?: ReviewOpenContext) => void;
}) {
  const firstOpportunity = session?.opportunities[0];
  const selectedOpportunity = useMemo(
    () => session?.opportunities.find((opportunity) =>
      opportunity.symbols.some((symbol) => symbol.toUpperCase() === selectedSymbol?.toUpperCase())
    ) ?? firstOpportunity,
    [firstOpportunity, selectedSymbol, session?.opportunities],
  );
  const [opportunityId, setOpportunityId] = useState(selectedOpportunity?.id ?? "");
  const [outcome, setOutcome] = useState<ReviewRecord["outcome"]>("unclear");
  const [reviewOutcomeFilter, setReviewOutcomeFilter] = useState<ReviewOutcomeFilter>("all");
  const [reviewSymbolFilter, setReviewSymbolFilter] = useState<string>(selectedSymbol ?? "all");
  const [observedMove, setObservedMove] = useState("");
  const [learning, setLearning] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (selectedOpportunity?.id && opportunityId !== selectedOpportunity.id) {
      setOpportunityId(selectedOpportunity.id);
    }
  }, [opportunityId, selectedOpportunity?.id]);

  useEffect(() => {
    setReviewSymbolFilter(selectedSymbol ?? "all");
  }, [selectedSymbol]);

  const reviewLedgerRows = useMemo(() => {
    const opportunities = session?.opportunities ?? [];
    return (session?.reviewRecords ?? [])
      .map((record) => {
        const opportunity = opportunities.find((item) => item.id === record.opportunityId);
        const symbols = opportunity?.symbols.length ? opportunity.symbols : [record.opportunityId];
        const selectedSymbolUpper = selectedSymbol?.toUpperCase();
        return {
          record,
          symbols,
          symbolLabel: symbols.join(", "),
          statusLabel: opportunity ? statusLabel(opportunity.status) : "未知机会",
          isSelectedSymbol: selectedSymbolUpper
            ? symbols.some((symbol) => symbol.toUpperCase() === selectedSymbolUpper)
            : false,
        };
      })
      .sort((left, right) => right.record.createdAt.localeCompare(left.record.createdAt));
  }, [selectedSymbol, session?.opportunities, session?.reviewRecords]);

  const reviewSymbolOptions = useMemo(() => {
    const symbols = new Set<string>();
    for (const row of reviewLedgerRows) {
      for (const symbol of row.symbols) symbols.add(symbol);
    }
    if (selectedSymbol) symbols.add(selectedSymbol);
    return [...symbols].sort((left, right) => left.localeCompare(right));
  }, [reviewLedgerRows, selectedSymbol]);

  const reviewOutcomeCounts = useMemo(() => {
    const counts: Record<ReviewOutcomeFilter, number> = {
      all: reviewLedgerRows.length,
      failed: 0,
      unclear: 0,
      validated: 0,
    };
    for (const row of reviewLedgerRows) {
      counts[row.record.outcome] += 1;
    }
    return counts;
  }, [reviewLedgerRows]);

  const filteredReviewRecords = useMemo(() => reviewLedgerRows.filter((row) => {
    const outcomeMatch = reviewOutcomeFilter === "all" || row.record.outcome === reviewOutcomeFilter;
    const symbolMatch = reviewSymbolFilter === "all"
      || row.symbols.some((symbol) => symbol.toUpperCase() === reviewSymbolFilter.toUpperCase());
    return outcomeMatch && symbolMatch;
  }), [reviewLedgerRows, reviewOutcomeFilter, reviewSymbolFilter]);
  const reviewLedgerFilteredCount = filteredReviewRecords.length;
  const reviewLedgerTotalCount = reviewLedgerRows.length;
  const summaryFilters: Array<{ value: ReviewOutcomeFilter; label: string; count: number }> = [
    { value: "all", label: "全部", count: reviewOutcomeCounts.all },
    { value: "validated", label: "已验证", count: reviewOutcomeCounts.validated },
    { value: "failed", label: "已失效", count: reviewOutcomeCounts.failed },
    { value: "unclear", label: "未确认", count: reviewOutcomeCounts.unclear },
  ];

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaveStatus("");
    if (!opportunityId || !observedMove.trim() || !learning.trim()) {
      setError("请选择机会，并填写观察到的变化和学习记录。");
      return;
    }
    const response = await fetch("/api/research/review-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day,
        opportunityId,
        outcome,
        observedMove: observedMove.trim(),
        failureReason: failureReason.trim(),
        learning: learning.trim(),
      }),
    });
    if (!response.ok) {
      setError(`Review record request failed: ${response.status}`);
      return;
    }
    setObservedMove("");
    setLearning("");
    setFailureReason("");
    setSaveStatus("复盘已保存，正在刷新机会行和复盘列表。");
    await onSaved();
    setSaveStatus("复盘已保存，机会行和复盘列表已刷新。");
  }

  return (
    <section className="review-records" aria-label="复盘记录">
      <div className="section-title-row">
        <h3>复盘记录</h3>
        <span>{session?.reviewRecords.length ?? 0} 条记录</span>
      </div>
      <div className="review-ledger-toolbar" aria-label="复盘筛选">
        <label>
          全部结果
          <select
            value={reviewOutcomeFilter}
            onChange={(event) => setReviewOutcomeFilter(event.target.value as ReviewOutcomeFilter)}
          >
            <option value="all">全部结果</option>
            <option value="validated">已验证</option>
            <option value="failed">已失效</option>
            <option value="unclear">未确认</option>
          </select>
        </label>
        <label>
          全部标的
          <select value={reviewSymbolFilter} onChange={(event) => setReviewSymbolFilter(event.target.value)}>
            <option value="all">全部标的</option>
            {reviewSymbolOptions.map((symbol) => (
              <option key={symbol} value={symbol}>{symbol}</option>
            ))}
          </select>
        </label>
        <Badge variant={reviewSymbolFilter === "all" ? "secondary" : "outline"}>
          {reviewSymbolFilter === "all" ? "全局复盘" : `当前标的 ${reviewSymbolFilter}`}
        </Badge>
        <p className="review-ledger-filter-status">
          显示 {reviewLedgerFilteredCount} / {reviewLedgerTotalCount} 条
        </p>
      </div>
      <div className="review-ledger-summary" aria-label="复盘状态汇总">
        {summaryFilters.map((item) => (
          <button
            aria-pressed={reviewOutcomeFilter === item.value}
            className="review-ledger-summary-button"
            key={item.value}
            onClick={() => setReviewOutcomeFilter(item.value)}
            type="button"
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
      <div className="review-ledger-table-wrap">
        {filteredReviewRecords.length ? (
          <table className="review-ledger-table">
            <thead>
              <tr>
                <th scope="col">时间</th>
                <th scope="col">标的</th>
                <th scope="col">结果</th>
                <th scope="col">复盘摘要</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviewRecords.map((row) => (
                <tr
                  className="review-ledger-row"
                  data-selected-symbol={row.isSelectedSymbol ? "true" : "false"}
                  key={row.record.id}
                >
                  <td>
                    <time dateTime={row.record.createdAt}>{row.record.createdAt}</time>
                  </td>
                  <td>
                    <strong>{row.symbolLabel}</strong>
                    <small>{row.statusLabel}</small>
                  </td>
                  <td>
                    <Badge
                      variant={row.record.outcome === "failed"
                        ? "destructive"
                        : row.record.outcome === "validated"
                          ? "success"
                          : "warning"}
                    >
                      {REVIEW_OUTCOME_LABELS[row.record.outcome]}
                    </Badge>
                  </td>
                  <td className="review-ledger-summary-cell">
                    <strong className="review-ledger-primary-text">{row.record.observedMove}</strong>
                    <small>学习：{row.record.learning}</small>
                    <details className="review-ledger-detail-toggle">
                      <summary>查看完整复盘</summary>
                      <dl className="review-ledger-detail-grid">
                        <div>
                          <dt>观察到的变化</dt>
                          <dd>{row.record.observedMove}</dd>
                        </div>
                        <div>
                          <dt>失效原因</dt>
                          <dd>{row.record.failureReason || "未记录"}</dd>
                        </div>
                        <div>
                          <dt>学习记录</dt>
                          <dd>{row.record.learning}</dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                  <td className="review-ledger-action-cell">
                    <Button
                      className="review-ledger-open-button"
                      onClick={() => onOpenOpportunity(row.symbols[0], { source: "review-ledger", reviewId: row.record.id })}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      打开机会
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="review-ledger-empty">
            当前筛选下没有复盘记录。先从选中机会完成证据刷新，再记录 outcome、观察到的变化和学习记录。
          </div>
        )}
      </div>
      <form className="review-form" onSubmit={saveReview}>
        <label>
          机会
          <select value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}>
            {(session?.opportunities ?? []).map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.symbols.join(", ")} / {statusLabel(opportunity.status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          结果
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as ReviewRecord["outcome"])}>
            <option value="unclear">未确认</option>
            <option value="validated">已验证</option>
            <option value="failed">已失效</option>
          </select>
        </label>
        <label>
          观察到的变化
          <textarea value={observedMove} onChange={(event) => setObservedMove(event.target.value)} rows={3} />
        </label>
        <label>
          失效原因
          <textarea value={failureReason} onChange={(event) => setFailureReason(event.target.value)} rows={2} />
        </label>
        <label>
          学习记录
          <textarea value={learning} onChange={(event) => setLearning(event.target.value)} rows={3} />
        </label>
        {error ? <p className="agent-error" role="alert">{error}</p> : null}
        <div aria-live="polite">
          {saveStatus ? <p className="inspector-success">{saveStatus}</p> : null}
        </div>
        <Button disabled={!opportunityId || !observedMove.trim() || !learning.trim()} type="submit">保存复盘</Button>
      </form>
    </section>
  );
}

function ResearchMainTabs({
  day,
  session,
  activeTab,
  selectedSymbol,
  opportunityFilter,
  pendingEvidenceAction,
  pendingReviewSymbol,
  onSelectedSymbolChange,
  onPendingEvidenceActionHandled,
  onAgentPrompt,
  onSessionRefresh,
  onOpenOpportunity,
}: {
  day: string;
  session: ResearchSession | null;
  activeTab: ResearchTab;
  selectedSymbol: string | null;
  opportunityFilter: string;
  pendingEvidenceAction: {
    id: number;
    symbol: string;
    tool: string;
    label: string;
  } | null;
  pendingReviewSymbol: PendingReviewSymbol | null;
  onSelectedSymbolChange: (symbol: string | null) => void;
  onPendingEvidenceActionHandled: (id: number) => void;
  onAgentPrompt: (command: Omit<AgentPromptCommand, "id">) => void;
  onSessionRefresh: () => Promise<void>;
  onOpenOpportunity: (symbol: string, context?: ReviewOpenContext) => void;
}) {
  return (
    <section className="research-main-tabs" aria-label="研究主工作区">
      <div className="research-tab-panel" role="tabpanel">
        {activeTab === "overview" ? <SessionOverview session={session} /> : null}
        {activeTab === "opportunities" ? (
          <OpportunityBoard
            day={day}
            filter={opportunityFilter}
            session={session}
            selectedSymbol={selectedSymbol}
            pendingEvidenceAction={pendingEvidenceAction}
            pendingReviewCommand={pendingReviewSymbol}
            onSelectedSymbolChange={onSelectedSymbolChange}
            onPendingEvidenceActionHandled={onPendingEvidenceActionHandled}
            onAgentPrompt={onAgentPrompt}
            onSessionRefresh={onSessionRefresh}
          />
        ) : null}
        {activeTab === "evidence" ? <EvidenceCenter session={session} /> : null}
        {activeTab === "market" ? <MarketInterpreter day={day} /> : null}
        {activeTab === "review" ? (
          <ReviewRecordsPanel
            day={day}
            selectedSymbol={selectedSymbol}
            session={session}
            onSaved={onSessionRefresh}
            onOpenOpportunity={onOpenOpportunity}
          />
        ) : null}
      </div>
    </section>
  );
}

function CommandPalette({
  open,
  session,
  selectedSymbol,
  onOpenChange,
  onTabChange,
  onDayChange,
  onOpportunitySelect,
  onEvidenceCommand,
  onReviewCommand,
  onAgentPrompt,
}: {
  open: boolean;
  session: ResearchSession | null;
  selectedSymbol: string | null;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: ResearchTab) => void;
  onDayChange: (day: string) => void;
  onOpportunitySelect: (symbol: string) => void;
  onEvidenceCommand: (command: { symbol: string; tool: string; label: string }) => void;
  onReviewCommand: (symbol: string) => void;
  onAgentPrompt: (command: Omit<AgentPromptCommand, "id">) => void;
}) {
  const [query, setQuery] = useState("");
  const symbols = uniqueSymbols(session);
  const intent = parseCommandIntent(query, selectedSymbol, symbols);
  const symbolSearchQuery = intent.explicitSymbol
    || (intent.normalizedQuery.startsWith("@")
      ? intent.normalizedQuery.slice(1)
      : intent.normalizedQuery.replace(/^\/(?:evidence|agent)\s+\w+\s+/i, ""));
  const visibleSymbols = symbols.filter((symbol) => commandMatches(symbol, symbolSearchQuery));
  const visibleDays = (session?.contextStatus.availableDays ?? [])
    .filter((availableDay) => intent.day
      ? availableDay.includes(intent.day)
      : commandMatches(`day:${availableDay} ${availableDay}`, query));
  const tabEntries = Object.entries(TAB_LABELS) as Array<[ResearchTab, string]>;
  const targetSymbol = intent.targetSymbol;
  const visibleEvidenceCommands = EVIDENCE_COMMANDS.filter((command) =>
    !intent.evidenceToken
    || command.token.includes(intent.evidenceToken)
    || command.label.toLowerCase().includes(intent.evidenceToken)
  );
  const visibleAgentPrompts = intent.agentAction === "invalidate"
    ? []
    : AGENT_PROMPTS.filter((prompt) => {
      if (!intent.agentAction) return true;
      return commandMatches(prompt, intent.normalizedQuery.replace(/^\/agent\s+\w+\s*/i, ""));
    });

  function closeAfter(action: () => void) {
    action();
    onOpenChange(false);
    setQuery("");
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="跳转模块、切换日期、定位机会或触发 Agent..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>没有匹配的研究入口。</CommandEmpty>
        <CommandGroup heading="Go to module">
          {tabEntries.map(([tab, label]) => {
            const Icon = TAB_META[tab].icon;
            return (
              <CommandItem
                key={tab}
                value={`${label} ${tab}`}
                onSelect={() => closeAfter(() => onTabChange(tab))}
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small className="command-item-description">选择后会切换到 {label}</small>
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Switch research day">
          {visibleDays.slice(0, 8).map((availableDay) => (
            <CommandItem
              key={availableDay}
              value={`day:${availableDay} ${availableDay} ${intent.explicitSymbol ? `@${intent.explicitSymbol}` : ""}`}
              onSelect={() => closeAfter(() => {
                onDayChange(availableDay);
                if (intent.explicitSymbol) onOpportunitySelect(intent.explicitSymbol);
              })}
            >
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>
                <strong>{availableDay}</strong>
                <small className="command-item-description">
                  {intent.explicitSymbol ? (
                    <>选择后会切换到 {availableDay} 并选中 {intent.explicitSymbol}</>
                  ) : (
                    <>选择后会切换到 {availableDay}</>
                  )}
                </small>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Open symbol">
          {visibleSymbols.slice(0, 12).map((symbol) => (
            <CommandItem
              key={symbol}
              value={`@${symbol} symbol ${symbol}`}
              onSelect={() => closeAfter(() => onOpportunitySelect(symbol))}
            >
              <Target className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>
                <strong>{symbol}</strong>
                <small className="command-item-description">选择后会切换到机会观察并选中 {symbol}</small>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Run evidence action">
          {visibleEvidenceCommands.map((command) => (
            <CommandItem
              key={`${command.token}-${targetSymbol}`}
              value={`/evidence ${command.token} ${targetSymbol}`}
              onSelect={() => closeAfter(() => onEvidenceCommand({ symbol: targetSymbol, tool: command.tool, label: command.label }))}
            >
              <FileSearch className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>
                <strong>/evidence {command.token} {targetSymbol}</strong>
                <small className="command-item-description">
                  选择后会切换到机会观察，选中 {targetSymbol} 并定位 {command.label} 证据动作
                </small>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ask agent">
          {visibleAgentPrompts.map((prompt) => (
            <CommandItem
              key={prompt}
              value={`agent ${prompt}`}
              onSelect={() => closeAfter(() => onAgentPrompt({
                text: prompt,
                source: "Command Palette",
                symbol: targetSymbol,
                promptType: "quick",
              }))}
            >
              <Bot className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>
                <strong>{prompt}</strong>
                <small className="command-item-description">选择后会把 prompt 写入右侧 Agent 输入框</small>
              </span>
            </CommandItem>
          ))}
          {intent.agentAction === "invalidate" || !intent.agentAction ? (
            <CommandItem
              value={`/agent invalidate ${targetSymbol}`}
              onSelect={() => closeAfter(() => onAgentPrompt({
                text: `invalidate ${targetSymbol}: list falsification checks before any judgement`,
                source: "Command Palette",
                symbol: targetSymbol,
                promptType: "invalidation",
              }))}
            >
              <Bot className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>
                <strong>/agent invalidate {targetSymbol}</strong>
                <small className="command-item-description">选择后会生成 {targetSymbol} 的反证 prompt</small>
              </span>
            </CommandItem>
          ) : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Create review note">
          <CommandItem
            value={`review ${targetSymbol}`}
            onSelect={() => closeAfter(() => onReviewCommand(targetSymbol))}
          >
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              <strong>为 {targetSymbol} 创建复盘</strong>
              <small className="command-item-description">选择后会切换到机会观察并打开复盘入口</small>
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function ResearchWorkspace() {
  const [day, setDay] = useState("");
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [activeTab, setActiveTab] = useState<ResearchTab>("opportunities");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [opportunityFilter, setOpportunityFilter] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState<AgentPromptCommand | null>(null);
  const [agentRailStatus, setAgentRailStatus] = useState<AgentRailStatus>({
    label: "就绪",
    tone: "idle",
    detail: "等待提问",
  });
  const [pendingEvidenceAction, setPendingEvidenceAction] = useState<{ id: number; symbol: string; tool: string; label: string } | null>(null);
  const [pendingReviewSymbol, setPendingReviewSymbol] = useState<PendingReviewSymbol | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const readiness = sourceReadiness(session);
  const missingEvidenceNeedCount = useMemo(
    () => session?.opportunities.reduce(
      (total, opportunity) => total + opportunity.evidenceNeeds.filter((need) => need.required).length,
      0,
    ) ?? 0,
    [session?.opportunities],
  );

  async function loadSession(signal?: AbortSignal) {
    setSessionError("");
    const sessionUrl = day
      ? `/api/research/session?day=${encodeURIComponent(day)}`
      : "/api/research/session";
    const response = await fetch(sessionUrl, { signal });
    if (!response.ok) {
      throw new Error(`Research session request failed: ${response.status}`);
    }
    const nextSession = (await response.json()) as ResearchSession;
    setSession(nextSession);
    if (!day && nextSession.day) {
      setDay(nextSession.day);
    }
  }

  async function refreshSession() {
    await loadSession();
  }

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal).catch((rawError) => {
      if ((rawError as Error).name === "AbortError") return;
      setSession(null);
      setSessionError(rawError instanceof Error ? rawError.message : String(rawError));
    });
    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLastFocusedElement();
        setCommandOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!commandOpen) {
      lastFocusedElementRef.current?.focus();
    }
  }, [commandOpen]);

  function setLastFocusedElement() {
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  function handleOpportunitySelect(symbol: string) {
    setActiveTab("opportunities");
    setSelectedSymbol(symbol);
    setOpportunityFilter(symbol);
  }

  function handleAgentPrompt(command: Omit<AgentPromptCommand, "id">) {
    setAgentPrompt({ id: Date.now(), ...command });
  }

  function handleEvidenceCommand(command: { symbol: string; tool: string; label: string }) {
    setActiveTab("opportunities");
    setSelectedSymbol(command.symbol);
    setOpportunityFilter(command.symbol);
    setPendingEvidenceAction({ id: Date.now(), ...command });
  }

  function handleReviewCommand(symbol: string) {
    setActiveTab("opportunities");
    setSelectedSymbol(symbol);
    setOpportunityFilter(symbol);
    setPendingReviewSymbol({ id: Date.now(), symbol, source: "command-palette" });
  }

  function handleReviewLedgerOpen(symbol: string, context?: ReviewOpenContext) {
    setActiveTab("opportunities");
    setSelectedSymbol(symbol);
    setOpportunityFilter(symbol);
    setPendingReviewSymbol({ id: Date.now(), symbol, source: context?.source, reviewId: context?.reviewId });
  }

  return (
    <section className="research-cockpit" aria-label="动态交易研究工作台">
      {sessionError ? <p className="agent-error" role="alert">{sessionError}</p> : null}
      <CommandPalette
        open={commandOpen}
        session={session}
        selectedSymbol={selectedSymbol}
        onOpenChange={setCommandOpen}
        onTabChange={setActiveTab}
        onDayChange={setDay}
        onOpportunitySelect={handleOpportunitySelect}
        onEvidenceCommand={handleEvidenceCommand}
        onReviewCommand={handleReviewCommand}
        onAgentPrompt={handleAgentPrompt}
      />
      <div className="research-shell-grid grid min-h-screen grid-cols-[260px_minmax(0,1fr)_380px] bg-background max-[1240px]:grid-cols-[230px_minmax(0,1fr)] max-[760px]:grid-cols-1">
        <SessionSidebar
          activeTab={activeTab}
          day={day}
          session={session}
          onDayChange={setDay}
          onTabChange={setActiveTab}
        />
        <main className="research-stage min-w-0 px-6 pb-6 max-[760px]:px-3">
          <div className="research-topbar sticky top-0 z-20 -mx-6 mb-5 flex min-h-16 items-center justify-between gap-4 border-b bg-background/90 px-6 backdrop-blur max-[760px]:-mx-3 max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:px-3 max-[760px]:py-3">
            <Button
              className="h-9 min-w-72 justify-between bg-muted text-muted-foreground hover:bg-secondary max-[760px]:min-w-0"
              variant="outline"
              type="button"
              onClick={() => {
                setLastFocusedElement();
                setCommandOpen(true);
              }}
            >
              <span className="flex items-center gap-2">
                <Search className="size-4" aria-hidden="true" />
                Search research...
              </span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-semibold">⌘K</kbd>
            </Button>
            <div className="research-topbar-context">
              <span>{TAB_LABELS[activeTab]}</span>
              <Badge variant={readiness.ready === readiness.total ? "success" : "warning"}>
                {selectedDayLabel(session?.contextStatus.selectedDayStatus)}
              </Badge>
            </div>
          </div>

          <CockpitStatusHeader
            day={day}
            session={session}
            readiness={readiness}
            missingEvidenceNeedCount={missingEvidenceNeedCount}
            agentStatus={agentRailStatus}
          />

          <SourceReadinessSummary session={session} />

          <div className="research-section-heading mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                {TAB_LABELS[activeTab]}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {activeTab === "opportunities" ? "机会观察工作台" : TAB_LABELS[activeTab]}
              </h1>
            </div>
            {opportunityFilter ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <ListFilter className="mr-1 size-3" aria-hidden="true" />
                  {opportunityFilter}
                </Badge>
                <Button size="sm" variant="ghost" type="button" onClick={() => setOpportunityFilter("")}>
                  清除过滤
                </Button>
              </div>
            ) : null}
          </div>

          <ResearchMainTabs
            activeTab={activeTab}
            day={day}
            session={session}
            selectedSymbol={selectedSymbol}
            opportunityFilter={opportunityFilter}
            pendingEvidenceAction={pendingEvidenceAction}
            pendingReviewSymbol={pendingReviewSymbol}
            onSelectedSymbolChange={setSelectedSymbol}
            onPendingEvidenceActionHandled={(id) => {
              setPendingEvidenceAction((current) => current?.id === id ? null : current);
            }}
            onAgentPrompt={handleAgentPrompt}
            onSessionRefresh={refreshSession}
            onOpenOpportunity={handleReviewLedgerOpen}
          />
        </main>
        <aside className="agent-shell border-l bg-card max-[1240px]:col-span-2 max-[760px]:col-span-1">
          <div className="flex items-center gap-2 border-b px-5 py-3 text-xs font-semibold text-muted-foreground">
            <PanelRight className="size-4" aria-hidden="true" />
            Agent side rail
          </div>
          <Separator />
          <AgentPanel
            day={day}
            promptCommand={agentPrompt}
            selectedSymbol={selectedSymbol}
            onStatusChange={setAgentRailStatus}
          />
        </aside>
      </div>
    </section>
  );
}
