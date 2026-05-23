"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AgentRunEvidenceList, AgentRunEvidenceSummary } from "@stock-summary/summary-core";
import { ScoreRows } from "./ScoreRows";

type AgentReply = {
  run_id: string;
  evidence_log_path: string;
  answer: string;
  reasoning_summary: string[];
  used_context: string[];
  next_watch_plan: string[];
  opportunity_reasoning: OpportunityReasoning;
  conversation_summary?: string;
  tool_trace: {
    name: string;
    input?: Record<string, string>;
    reason: string;
    result_summary: string;
  }[];
  policy_decisions: {
    name: string;
    status: "allowed" | "blocked";
    reason: string;
  }[];
  provider: string;
  provider_status: "ready" | "fallback" | "error";
};

type OpportunityReasoning = {
  context: {
    day: string;
    sourceScope: string[];
    observationOnly: true;
  };
  adminTheory: {
    summary: string;
    supportingPoints: string[];
    openRisks: string[];
  };
  marketIntelNeeds: string[];
  evidenceNeeds: {
    kind: "quote" | "history" | "news" | "fundamental";
    symbol: string;
    question: string;
    preferredTools: string[];
    required: boolean;
  }[];
  candidateOpportunities: {
    symbol: string;
    thesis: string;
    sourceBasis: string[];
    invalidation: string[];
    researchOnly: true;
  }[];
  invalidationPlan: string[];
  nextChecks: string[];
  researchPlan: {
    stage: "hypothesis" | "evidence" | "falsification" | "data_plan" | "synthesis";
    title: string;
    question: string;
    method: string;
    expectedOutput: string;
    toolHints: string[];
  }[];
  reasoningSummary: string[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentRunHistory = AgentRunEvidenceList;

type ResearchContextStatus = {
  day: string;
  hasStructuredSummary: boolean;
  hasOpportunityObservation: boolean;
  hasSourceSummary: boolean;
  structuredSummaryPath: string;
  opportunityPath: string;
  sourceSummaryPath: string;
  eventSummaryCount: number;
  overviewCount: number;
  adminCoreCount: number;
  adminSymbolCount: number;
  riskCount: number;
  adminSymbolsPreview: string[];
  missing: string[];
};

type ToolTrace = AgentReply["tool_trace"][number];

type ResearchToolReadiness = {
  name: string;
  source: "local" | "external";
  enabled: boolean;
  policy: {
    status: "allowed" | "blocked";
    reason: string;
  };
};

type ScoreTraceRow = {
  rank: number;
  label: string;
  score: number;
  confidence: string;
  reason: string;
};

type YfinanceHistoryMetric = {
  label: string;
  value: string;
};

type YfinanceHistoryTrace = {
  symbol: string;
  period: string;
  observations: string;
  metrics: YfinanceHistoryMetric[];
};

type ResearchPlanStep = OpportunityReasoning["researchPlan"][number];
type ResearchPlanStatus = "done" | "blocked" | "pending" | "process";

function researchPlanStepStatus(
  step: ResearchPlanStep,
  reply: AgentReply,
): { status: ResearchPlanStatus; tools: string[] } {
  const executedTools = new Set(reply.tool_trace.map((tool) => tool.name));
  const blockedTools = new Set(
    reply.policy_decisions
      .filter((decision) => decision.status === "blocked")
      .map((decision) => decision.name),
  );

  if (step.toolHints.some((tool) => blockedTools.has(tool))) {
    return {
      status: "blocked",
      tools: step.toolHints.filter((tool) => blockedTools.has(tool)),
    };
  }

  if (step.toolHints.some((tool) => executedTools.has(tool))) {
    return {
      status: "done",
      tools: step.toolHints.filter((tool) => executedTools.has(tool)),
    };
  }

  if (step.toolHints.length) {
    return { status: "pending", tools: step.toolHints };
  }

  return { status: "process", tools: [] };
}

function parseScoreTraceRows(summary: string): ScoreTraceRow[] {
  return summary.split(/\r?\n/).flatMap((line) => {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5) return [];

    const rank = Number.parseInt(parts[0], 10);
    const score = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(rank) || !Number.isFinite(score)) return [];

    return [{
      rank,
      label: parts[1],
      score: Math.max(0, Math.min(100, score)),
      confidence: parts[3],
      reason: parts.slice(4).join(" | "),
    }];
  });
}

function historyPartValue(parts: string[], label: string) {
  const prefix = `${label} `;
  return parts.find((part) => part.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

function parseYfinanceHistoryTrace(summary: string): YfinanceHistoryTrace | null {
  if (!summary.startsWith("yfinance history")) return null;
  const parts = summary.split(";").map((part) => part.trim()).filter(Boolean);
  const symbol = parts[1] ?? "";
  const period = historyPartValue(parts, "period");
  const observations = historyPartValue(parts, "observations");
  const metrics = [
    { label: "Close change", value: historyPartValue(parts, "close change") },
    { label: "Max drawdown", value: historyPartValue(parts, "max drawdown") },
    { label: "Realized volatility", value: historyPartValue(parts, "realized volatility") },
    { label: "Latest volume ratio", value: historyPartValue(parts, "latest volume ratio") },
    { label: "Average volume", value: historyPartValue(parts, "average volume") },
  ].filter((metric) => metric.value);

  if (!symbol || !period || !metrics.length) return null;
  return { symbol, period, observations, metrics };
}

function extractTickerSymbol(value: string | undefined) {
  return value?.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/)?.[0] ?? "";
}

function ToolTraceResult({ tool }: { tool: ToolTrace }) {
  if (tool.name === "score_opportunities") {
    const rows = parseScoreTraceRows(tool.result_summary);
    if (rows.length) {
      return (
        <div className="score-trace">
          <ScoreRows rows={rows} />
          {tool.reason ? <p className="score-reason">{tool.reason}</p> : null}
        </div>
      );
    }
  }

  if (tool.name === "yfinance_history") {
    const history = parseYfinanceHistoryTrace(tool.result_summary);
    if (history) {
      return (
        <div className="history-trace">
          <div className="history-trace-head">
            <strong>{history.symbol}</strong>
            <span>{history.period}</span>
            {history.observations ? <em>{history.observations} observations</em> : null}
          </div>
          <div className="history-metrics">
            {history.metrics.map((metric) => (
              <div className="history-metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          {tool.reason ? <p>{tool.reason}</p> : null}
        </div>
      );
    }
  }

  return (
    <>
      {tool.result_summary}
      {tool.reason ? <span>（{tool.reason}）</span> : null}
    </>
  );
}

function AgentEvidenceDetail({ reply }: { reply: AgentReply }) {
  const blockedDecisions = reply.policy_decisions.filter((decision) => decision.status === "blocked");

  return (
    <section className="agent-evidence-detail" aria-label="本次回答证据详情">
      <div className="context-status-head">
        <h3>证据详情</h3>
        <span>{reply.provider_status}</span>
      </div>

      <div className="agent-evidence-stats">
        <article>
          <span>executed</span>
          <strong>{reply.tool_trace.length}</strong>
        </article>
        <article>
          <span>blocked</span>
          <strong>{blockedDecisions.length}</strong>
        </article>
        <article>
          <span>provider</span>
          <strong>{reply.provider}</strong>
        </article>
      </div>

      <p className="agent-evidence-log">
        evidence log: <span>{reply.evidence_log_path}</span>
      </p>

      {reply.tool_trace.length ? (
        <div className="agent-evidence-list">
          {reply.tool_trace.map((tool, index) => (
            <article className="agent-evidence-row" key={`${tool.name}-evidence-${index}`}>
              <strong>{tool.name}</strong>
              <p>{tool.result_summary}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="agent-evidence-empty">本次没有执行额外工具，仅依据本地上下文回答。</p>
      )}

      {blockedDecisions.length ? (
        <div className="agent-evidence-list">
          {blockedDecisions.map((decision, index) => (
            <article className="agent-evidence-row agent-evidence-blocked" key={`${decision.name}-blocked-${index}`}>
              <strong>{decision.name}</strong>
              <p>{decision.reason}</p>
            </article>
          ))}
        </div>
      ) : null}

      <p className="agent-evidence-boundary">
        <strong>研究边界：</strong>
        本区块只解释证据来源、工具策略和观察依据，不构成买卖指令。
      </p>
    </section>
  );
}

type AgentPanelProps = {
  day: string;
  onDayChange: (day: string) => void;
};

export function AgentPanel({ day, onDayChange }: AgentPanelProps) {
  const [message, setMessage] = useState("基于今天的机会观察，哪些假设最需要反证？");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [runHistory, setRunHistory] = useState<AgentRunHistory | null>(null);
  const [contextStatus, setContextStatus] = useState<ResearchContextStatus | null>(null);
  const [toolReadiness, setToolReadiness] = useState<ResearchToolReadiness[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [runError, setRunError] = useState("");
  const [toolError, setToolError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRunHistory(signal?: AbortSignal) {
    setRunError("");
    const response = await fetch(`/api/agent/runs?day=${encodeURIComponent(day)}`, { signal });
    if (!response.ok) {
      throw new Error(`Agent run history request failed: ${response.status}`);
    }
    setRunHistory((await response.json()) as AgentRunHistory);
  }

  useEffect(() => {
    const controller = new AbortController();
    setContextLoading(true);
    setContextError("");

    fetch(`/api/research/context?day=${encodeURIComponent(day)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Context request failed: ${response.status}`);
        }
        setContextStatus((await response.json()) as ResearchContextStatus);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setContextStatus(null);
        setContextError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setContextLoading(false));

    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    const controller = new AbortController();

    loadRunHistory(controller.signal)
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setRunHistory(null);
        setRunError(rawError instanceof Error ? rawError.message : String(rawError));
      });

    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    const controller = new AbortController();
    setToolError("");

    fetch("/api/research/tools", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Tool readiness request failed: ${response.status}`);
        }
        const payload = (await response.json()) as { tools?: ResearchToolReadiness[] };
        setToolReadiness(payload.tools ?? []);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setToolReadiness([]);
        setToolError(rawError instanceof Error ? rawError.message : String(rawError));
      });

    return () => controller.abort();
  }, []);

  function evidenceRefreshPrompt() {
    const evidenceSymbol = reply?.opportunity_reasoning.evidenceNeeds
      .find((need) => need.symbol !== "GENERAL")?.symbol;
    const symbol = extractTickerSymbol(evidenceSymbol)
      || extractTickerSymbol(contextStatus?.adminSymbolsPreview[0])
      || "GENERAL";
    return `refresh all missing evidence for ${symbol} before comparing the opportunity`;
  }

  async function runAgent(nextMessage: string) {
    const normalizedMessage = nextMessage.trim();
    if (!normalizedMessage) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, message: normalizedMessage, messages }),
      });
      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.status}`);
      }
      const nextReply = (await response.json()) as AgentReply;
      setReply(nextReply);
      setMessages((current): ChatMessage[] => [
        ...current,
        { role: "user" as const, content: normalizedMessage },
        { role: "assistant" as const, content: nextReply.answer },
      ].slice(-8));
      await loadRunHistory();
    } catch (rawError) {
      setError(rawError instanceof Error ? rawError.message : String(rawError));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAgent(message);
  }

  async function runEvidenceRefresh() {
    const nextMessage = evidenceRefreshPrompt();
    setMessage(nextMessage);
    await runAgent(nextMessage);
  }

  return (
    <aside className="agent-panel" aria-label="机会观察 Agent">
      <div className="agent-header">
        <div>
          <p>Context Agent</p>
          <h2>机会观察助手</h2>
        </div>
        <span>{reply ? `${reply.provider}:${reply.provider_status}` : "ready"}</span>
      </div>

      <form onSubmit={submit} className="agent-form">
        <label>
          日期
          <input value={day} onChange={(event) => onDayChange(event.target.value)} />
        </label>
        <label>
          问题
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} />
        </label>
        <div className="agent-quick-actions">
          <button disabled={loading} type="button" onClick={runEvidenceRefresh}>
            刷新缺失证据
          </button>
        </div>
        <button className="agent-submit-button" disabled={loading} type="submit">
          {loading ? "分析中..." : "询问 Agent"}
        </button>
      </form>

      <section className="context-status" aria-live="polite">
        <div className="context-status-head">
          <h3>上下文预检</h3>
          <span>{contextLoading ? "checking" : contextStatus?.missing.length ? "partial" : "ready"}</span>
        </div>
        {contextError ? <p>{contextError}</p> : null}
        {contextStatus ? (
          <>
            <dl>
              <div>
                <dt>结构化日报</dt>
                <dd>{contextStatus.hasStructuredSummary ? "可用" : "缺失"}</dd>
              </div>
              <div>
                <dt>机会观察</dt>
                <dd>{contextStatus.hasOpportunityObservation ? "可用" : "缺失"}</dd>
              </div>
              <div>
                <dt>本地总结</dt>
                <dd>{contextStatus.hasSourceSummary ? "可用" : "缺失"}</dd>
              </div>
            </dl>
            <p>
              管理员标的 {contextStatus.adminSymbolCount} 个，核心理论 {contextStatus.adminCoreCount} 条，
              风险 {contextStatus.riskCount} 条
            </p>
            {contextStatus.adminSymbolsPreview.length ? (
              <div className="context-symbols">
                {contextStatus.adminSymbolsPreview.map((symbol) => (
                  <span key={symbol}>{symbol}</span>
                ))}
              </div>
            ) : null}
            <p className="context-path">{contextStatus.sourceSummaryPath}</p>
          </>
        ) : null}
      </section>

      <section className="agent-run-list" aria-live="polite">
        <div className="context-status-head">
          <h3>历史运行</h3>
          <span>{runHistory?.runs.length ?? 0} runs</span>
        </div>
        {runError ? <p>{runError}</p> : null}
        {runHistory?.runs.length ? (
          <div className="agent-run-items">
            {runHistory.runs.map((run: AgentRunEvidenceSummary) => (
              <article key={run.run_id}>
                <div className="agent-run-item-head">
                  <strong>{run.run_id}</strong>
                  <span>{run.provider_status}</span>
                </div>
                <p>{run.message_preview}</p>
                <div className="agent-run-tags">
                  {run.tool_names.map((tool) => (
                    <span key={`${run.run_id}-${tool}`}>{tool}</span>
                  ))}
                </div>
                {run.blocked_tools.length ? (
                  <div className="agent-run-blocked-tags">
                    {run.blocked_tools.map((tool) => (
                      <span key={`${run.run_id}-blocked-${tool}`}>blocked: {tool}</span>
                    ))}
                  </div>
                ) : null}
                {run.candidate_symbols.length ? (
                  <p className="agent-run-symbols">{run.candidate_symbols.join(" / ")}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p>当前日期暂无本地运行记录。</p>
        )}
        {runHistory?.evidence_log_path ? (
          <p className="context-path">{runHistory.evidence_log_path}</p>
        ) : null}
      </section>

      <section className="tool-readiness" aria-live="polite">
        <div className="context-status-head">
          <h3>Tool policy</h3>
          <span>
            {toolReadiness.filter((tool) => tool.policy.status === "allowed").length}/{toolReadiness.length} allowed
          </span>
        </div>
        {toolError ? <p>{toolError}</p> : null}
        <div className="tool-readiness-grid">
          {toolReadiness.map((tool) => (
            <article key={tool.name}>
              <div>
                <strong>{tool.name}</strong>
                <span className={`tool-policy-pill tool-policy-${tool.policy.status}`}>
                  {tool.policy.status}
                </span>
              </div>
              <p>{tool.policy.reason}</p>
            </article>
          ))}
        </div>
      </section>

      {error ? <p className="agent-error">{error}</p> : null}

      {messages.length ? (
        <section className="agent-history">
          <h3>对话上下文</h3>
          {messages.slice(-4).map((item, index) => (
            <p key={`${item.role}-${index}`}>
              <strong>{item.role === "user" ? "你" : "Agent"}：</strong>
              {item.content}
            </p>
          ))}
        </section>
      ) : null}

      {reply ? (
        <section className="agent-reply">
          <h3>回答</h3>
          <p className="agent-answer-text">{reply.answer}</p>
          <p className="agent-run-meta">
            run: <strong>{reply.run_id}</strong>
            <span>{reply.evidence_log_path}</span>
          </p>

          <AgentEvidenceDetail reply={reply} />

          <h3>推理摘要</h3>
          <ul>
            {reply.reasoning_summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {reply.used_context.length ? (
            <>
              <h3>已用上下文</h3>
              <ul>
                {reply.used_context.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}

          {reply.opportunity_reasoning ? (
            <section className="agent-reasoning-context">
              <h3>推演上下文</h3>
              <p>{reply.opportunity_reasoning.adminTheory.summary}</p>

              {reply.opportunity_reasoning.candidateOpportunities.length ? (
                <>
                  <h4>候选观察</h4>
                  <ul>
                    {reply.opportunity_reasoning.candidateOpportunities.map((candidate) => (
                      <li key={candidate.symbol}>
                        <strong>{candidate.symbol}</strong>：{candidate.thesis}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.marketIntelNeeds.length ? (
                <>
                  <h4>市场情报需求</h4>
                  <ul>
                    {reply.opportunity_reasoning.marketIntelNeeds.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.researchPlan.length ? (
                <>
                  <h4>研究计划</h4>
                  <div className="agent-research-plan">
                    {reply.opportunity_reasoning.researchPlan.map((step) => {
                      const planStatus = researchPlanStepStatus(step, reply);
                      return (
                        <article key={step.stage}>
                          <div>
                            <strong>{step.title}</strong>
                            <span>{step.stage}</span>
                            <span className={`agent-plan-status agent-plan-status-${planStatus.status}`}>
                              {planStatus.status}
                            </span>
                          </div>
                          <p>{step.question}</p>
                          <small>{step.method}</small>
                          <em>{step.expectedOutput}</em>
                          {planStatus.tools.length ? (
                            <code>{planStatus.tools.join(" / ")}</code>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {reply.opportunity_reasoning.evidenceNeeds.length ? (
                <>
                  <h4>证据需求</h4>
                  <div className="agent-evidence-needs">
                    {reply.opportunity_reasoning.evidenceNeeds.slice(0, 8).map((need, index) => (
                      <article key={`${need.kind}-${need.symbol}-${index}`}>
                        <div>
                          <strong>{need.symbol}</strong>
                          <span>{need.kind}</span>
                          {need.required ? <em>required</em> : null}
                        </div>
                        <p>{need.question}</p>
                        <small>{need.preferredTools.join(" / ")}</small>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {reply.opportunity_reasoning.invalidationPlan.length ? (
                <>
                  <h4>反证条件</h4>
                  <ul>
                    {reply.opportunity_reasoning.invalidationPlan.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.nextChecks.length ? (
                <>
                  <h4>下一步检查</h4>
                  <ul>
                    {reply.opportunity_reasoning.nextChecks.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          <h3>工具调用</h3>
          <ul>
            {reply.tool_trace.map((tool, index) => (
              <li key={`${tool.name}-${index}-${JSON.stringify(tool.input ?? {})}`}>
                <strong>{tool.name}</strong>：<ToolTraceResult tool={tool} />
              </li>
            ))}
          </ul>

          <h3>工具策略</h3>
          <ul>
            {reply.policy_decisions.map((decision, index) => (
              <li key={`${decision.name}-${decision.status}-${index}`}>
                <strong>{decision.status}</strong> {decision.name}：{decision.reason}
              </li>
            ))}
          </ul>

          <h3>下一步观察</h3>
          <ul>
            {reply.next_watch_plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
