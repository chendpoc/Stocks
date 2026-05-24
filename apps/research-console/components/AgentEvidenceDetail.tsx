import { ScoreRows } from "./ScoreRows";
import type { AgentReply, ToolTrace } from "./agent-panel-types";
import { formatBoundedPath, policyStatusLabel, providerStatusLabel } from "./agent-panel-types";

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

export function ToolTraceResult({ tool }: { tool: ToolTrace }) {
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

type AgentEvidenceDetailProps = {
  reply: AgentReply;
};

export function AgentEvidenceDetail({ reply }: AgentEvidenceDetailProps) {
  const blockedDecisions = reply.policy_decisions.filter((decision) => decision.status === "blocked");

  return (
    <section className="agent-evidence-detail" aria-label="本次回答证据详情">
      <div className="context-status-head">
        <h3>证据详情</h3>
        <span>{providerStatusLabel(reply.provider_status)}</span>
      </div>

      <div className="agent-evidence-stats">
        <article>
          <span>已执行</span>
          <strong>{reply.tool_trace.length}</strong>
        </article>
        <article>
          <span>已阻断</span>
          <strong>{blockedDecisions.length}</strong>
        </article>
        <article>
          <span>提供方</span>
          <strong>{reply.provider}</strong>
        </article>
      </div>

      <p className="agent-evidence-log">
        证据日志：<span>{formatBoundedPath(reply.evidence_log_path)}</span>
      </p>

      {reply.tool_trace.length ? (
        <div className="tool-trace-list tool-trace-executed-list">
          <h4 className="tool-trace-heading">已执行工具</h4>
          {reply.tool_trace.map((tool, index) => (
            <article className="tool-trace-card tool-trace-executed" key={`${tool.name}-evidence-${index}`}>
              <div className="tool-trace-card-head">
                <strong>{tool.name}</strong>
                {tool.reason ? <span className="tool-trace-reason">{tool.reason}</span> : null}
              </div>
              <div className="tool-trace-result">
                <ToolTraceResult tool={tool} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="agent-evidence-empty">本次没有执行额外工具，仅依据本地上下文回答。</p>
      )}

      {blockedDecisions.length ? (
        <div className="tool-trace-list tool-trace-blocked-list">
          <h4 className="tool-trace-heading">已阻断工具</h4>
          {blockedDecisions.map((decision, index) => (
            <article className="tool-trace-card tool-trace-blocked" key={`${decision.name}-blocked-${index}`}>
              <div className="tool-trace-card-head">
                <strong>{decision.name}</strong>
                <span className="tool-trace-blocked-tag">{policyStatusLabel("blocked")}</span>
              </div>
              <p className="tool-trace-blocked-reason">{decision.reason}</p>
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

type AgentToolTraceSectionProps = {
  toolTrace: AgentReply["tool_trace"];
  policyDecisions: AgentReply["policy_decisions"];
};

export function AgentToolTraceSection({ toolTrace, policyDecisions }: AgentToolTraceSectionProps) {
  const blockedDecisions = policyDecisions.filter((decision) => decision.status === "blocked");

  return (
    <>
      <h3>工具调用</h3>
      {toolTrace.length ? (
        <div className="tool-trace-list tool-trace-executed-list">
          {toolTrace.map((tool, index) => (
            <article className="tool-trace-card tool-trace-executed" key={`${tool.name}-${index}-${JSON.stringify(tool.input ?? {})}`}>
              <div className="tool-trace-card-head">
                <strong>{tool.name}</strong>
                {tool.reason ? <span className="tool-trace-reason">{tool.reason}</span> : null}
              </div>
              <div className="tool-trace-result">
                <ToolTraceResult tool={tool} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="agent-evidence-empty">本次未执行工具调用。</p>
      )}

      <h3>工具策略</h3>
      {policyDecisions.length ? (
        <div className="tool-trace-list">
          {policyDecisions.map((decision, index) => (
            <article
              className={`tool-trace-card ${decision.status === "blocked" ? "tool-trace-blocked" : "tool-trace-policy-allowed"}`}
              key={`${decision.name}-${decision.status}-${index}`}
            >
              <div className="tool-trace-card-head">
                <strong>{decision.name}</strong>
                <span className={`tool-policy-pill tool-policy-${decision.status}`}>
                  {policyStatusLabel(decision.status)}
                </span>
              </div>
              <p className="tool-trace-blocked-reason">{decision.reason}</p>
            </article>
          ))}
        </div>
      ) : null}

      {blockedDecisions.length ? (
        <p className="agent-evidence-boundary">
          <strong>策略说明：</strong>
          已阻断 {blockedDecisions.length} 个外部或受限工具，当前回答仅基于允许的研究上下文。
        </p>
      ) : null}
    </>
  );
}
