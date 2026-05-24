"use client";

import { FormEvent, useEffect, useState } from "react";
import type { MarketInterpretation, ResearchSession } from "@stock-summary/summary-core";
import { AgentPanel } from "./AgentPanel";
import { DataSourcePanel } from "./DataSourcePanel";
import { OpportunityBoard } from "./OpportunityBoard";

const TAB_LABELS = {
  overview: "今日概览",
  opportunities: "机会观察",
  evidence: "证据中心",
  market: "市场解读",
  review: "复盘记录",
} as const;

type ResearchTab = keyof typeof TAB_LABELS;

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
    <aside className="session-sidebar fortress-sidebar" aria-label="研究会话导航">
      <div className="fortress-brand">
        <div className="fortress-mark" aria-hidden="true">R</div>
        <div>
          <strong>Research</strong>
          <span>Workbench</span>
        </div>
      </div>

      <nav className="fortress-nav" aria-label="研究模块">
        <p>Overview</p>
        {tabEntries.map(([key, label]) => (
          <button
            aria-current={activeTab === key ? "page" : undefined}
            className={activeTab === key ? "fortress-nav-active" : undefined}
            key={key}
            onClick={() => onTabChange(key)}
            type="button"
          >
            <span aria-hidden="true">{label.slice(0, 1)}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="session-sidebar-footer">
        <label htmlFor="research-session-day">
          研究日期
          <input
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
        {session?.contextStatus.requestedDay === "latest" ? (
          <p className="session-ok">已自动选择最新可用研究日：{session.day}</p>
        ) : null}
        <div className="session-status-card">
          <span>Session</span>
          <strong>{session ? statusLabel(session.status) : "加载中"}</strong>
        </div>
        <div className="session-stat-grid">
          <article>
            <span>机会</span>
            <strong>{session?.opportunities.length ?? 0}</strong>
          </article>
          <article>
            <span>证据</span>
            <strong>{session?.evidenceRuns.length ?? 0}</strong>
          </article>
          <article>
            <span>复盘</span>
            <strong>{session?.reviewRecords.length ?? 0}</strong>
          </article>
        </div>
        {missing.length ? (
          <p className="session-warning">缺少上下文：{missing.join("、")}</p>
        ) : (
          <p className="session-ok">上下文已就绪</p>
        )}
        <DataSourcePanel />
      </div>
    </aside>
  );
}

function SessionOverview({ session }: { session: ResearchSession | null }) {
  if (!session) return <p className="cockpit-muted">正在加载研究会话。</p>;

  return (
    <section className="session-overview" aria-label="今日概览">
      <div className="overview-grid">
        <article>
          <h3>管理员理论</h3>
          <ul>
            {session.sourceContext.adminTheory.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>市场主线</h3>
          <ul>
            {session.sourceContext.marketContext.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article>
          <h3>重点标的</h3>
          <div className="symbol-pill-row">
            {session.sourceContext.keySymbols.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
        <article>
          <h3>风险</h3>
          <ul>
            {session.sourceContext.risks.slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function SourceReadinessStrip({ session }: { session: ResearchSession | null }) {
  const statuses = session?.contextStatus.sourceStatuses ?? [];
  if (!statuses.length) return null;

  return (
    <div className="source-readiness-strip" aria-label="资料状态">
      {statuses.map((source) => (
        <article className={source.available ? "source-ready" : "source-missing"} key={source.key}>
          <span>{source.label}</span>
          <strong>{source.available ? "可用" : "缺失"}</strong>
          <small>{source.resolvedPath ?? source.path}</small>
        </article>
      ))}
    </div>
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

function MarketInterpreter({
  day,
}: {
  day: string;
}) {
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
        <button disabled={loading} onClick={runMarketInterpretation} type="button">
          {loading ? "分析中" : "生成解读"}
        </button>
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
  onSaved,
}: {
  day: string;
  session: ResearchSession | null;
  onSaved: () => void;
}) {
  const firstOpportunity = session?.opportunities[0];
  const [opportunityId, setOpportunityId] = useState(firstOpportunity?.id ?? "");
  const [outcome, setOutcome] = useState("unclear");
  const [observedMove, setObservedMove] = useState("");
  const [learning, setLearning] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opportunityId && firstOpportunity?.id) {
      setOpportunityId(firstOpportunity.id);
    }
  }, [firstOpportunity?.id, opportunityId]);

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/research/review-record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day,
        opportunityId,
        outcome,
        observedMove,
        failureReason,
        learning,
      }),
    });
    if (!response.ok) {
      setError(`Review record request failed: ${response.status}`);
      return;
    }
    setObservedMove("");
    setLearning("");
    setFailureReason("");
    onSaved();
  }

  return (
    <section className="review-records" aria-label="复盘记录">
      <div className="section-title-row">
        <h3>复盘记录</h3>
        <span>{session?.reviewRecords.length ?? 0} 条记录</span>
      </div>
      <form className="review-form" onSubmit={saveReview}>
        <label>
          机会
          <select value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}>
            {(session?.opportunities ?? []).map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.symbols.join(", ")} / {opportunity.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          结果
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
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
        <button type="submit">保存复盘</button>
      </form>
      <div className="review-list">
        {(session?.reviewRecords ?? []).map((record) => (
          <article key={record.id}>
            <strong>{record.outcome}</strong>
            <p>{record.observedMove}</p>
            <small>{record.learning}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResearchMainTabs({
  day,
  session,
  activeTab,
  onDayChange,
  onSessionRefresh,
}: {
  day: string;
  session: ResearchSession | null;
  activeTab: ResearchTab;
  onDayChange: (day: string) => void;
  onSessionRefresh: () => void;
}) {
  return (
    <section className="research-main-tabs" aria-label="研究主工作区">
      <div className="research-tab-panel" role="tabpanel">
        {activeTab === "overview" ? <SessionOverview session={session} /> : null}
        {activeTab === "opportunities" ? (
          <OpportunityBoard
            day={day}
            onDayChange={onDayChange}
            onEvidenceRecorded={onSessionRefresh}
          />
        ) : null}
        {activeTab === "evidence" ? <EvidenceCenter session={session} /> : null}
        {activeTab === "market" ? <MarketInterpreter day={day} /> : null}
        {activeTab === "review" ? (
          <ReviewRecordsPanel day={day} session={session} onSaved={onSessionRefresh} />
        ) : null}
      </div>
    </section>
  );
}

export function ResearchWorkspace() {
  const [day, setDay] = useState("");
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [activeTab, setActiveTab] = useState<ResearchTab>("opportunities");

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

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal).catch((rawError) => {
      if ((rawError as Error).name === "AbortError") return;
      setSession(null);
      setSessionError(rawError instanceof Error ? rawError.message : String(rawError));
    });
    return () => controller.abort();
  }, [day]);

  return (
    <section className="research-cockpit" aria-label="动态交易研究工作台">
      {sessionError ? <p className="agent-error" role="alert">{sessionError}</p> : null}
      <div className="research-cockpit-grid">
        <SessionSidebar
          activeTab={activeTab}
          day={day}
          session={session}
          onDayChange={setDay}
          onTabChange={setActiveTab}
        />
        <div className="workspace-stage">
          <div className="research-cockpit-topbar">
            <button className="cockpit-search" type="button">
              Search research...
              <kbd>⌘K</kbd>
            </button>
            <div className="cockpit-status-strip">
              <span>{session ? statusLabel(session.status) : "加载中"}</span>
              <span>{session?.contextStatus.selectedDayStatus ?? "resolving"}</span>
              <span>机会 {session?.opportunities.length ?? 0}</span>
              <span>证据 {session?.evidenceRuns.length ?? 0}</span>
              <span>复盘 {session?.reviewRecords.length ?? 0}</span>
            </div>
          </div>
          <SourceReadinessStrip session={session} />
          <ResearchMainTabs
            activeTab={activeTab}
            day={day}
            session={session}
            onDayChange={setDay}
            onSessionRefresh={() => void loadSession()}
          />
        </div>
        <AgentPanel day={day} onDayChange={setDay} />
      </div>
    </section>
  );
}
