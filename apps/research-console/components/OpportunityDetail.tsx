"use client";

import { useState } from "react";
import type {
  AgentToolPolicyDecision,
  AgentToolTrace,
  EvidenceNeed,
  OpportunityBoardScore,
  OpportunityReasoningCandidate,
} from "@stock-summary/summary-core";

const MAX_EVIDENCE_NEEDS = 5;
const MAX_INVALIDATION_LINES = 5;

const COMPONENT_LABELS: Record<keyof OpportunityBoardScore["components"], string> = {
  thesis_alignment: "理论对齐",
  trigger_clarity: "触发清晰度",
  evidence_quality: "证据质量",
  invalidation_clarity: "失效清晰度",
  liquidity_risk: "流动性风险",
};

const ACTION_TOOL_NAMES = new Set([
  "yfinance_quote",
  "alpha_vantage_quote",
  "longbridge_quote",
  "yfinance_history",
  "news_search",
]);

export type EvidenceToolActionRequest = {
  day: string;
  tool: string;
  symbol?: string;
  query?: string;
  period?: string;
};

export type ExternalEvidenceResult = {
  policy?: AgentToolPolicyDecision;
  tool: AgentToolTrace;
};

type OpportunityDetailProps = {
  day: string;
  score: OpportunityBoardScore | null;
  evidenceNeeds?: EvidenceNeed[];
  candidateOpportunities?: OpportunityReasoningCandidate[];
  onRunEvidenceTool: (request: EvidenceToolActionRequest) => Promise<ExternalEvidenceResult>;
};

function matchingEvidenceNeeds(symbol: string, evidenceNeeds: EvidenceNeed[]) {
  return evidenceNeeds.filter((need) => need.symbol === symbol).slice(0, MAX_EVIDENCE_NEEDS);
}

function matchingInvalidation(symbol: string, candidates: OpportunityReasoningCandidate[]) {
  const candidate = candidates.find((item) => item.symbol === symbol);
  return (candidate?.invalidation ?? []).slice(0, MAX_INVALIDATION_LINES);
}

function toolLabel(tool: string) {
  if (tool === "alpha_vantage_quote") return "Alpha Vantage";
  if (tool === "longbridge_quote") return "Longbridge";
  if (tool === "yfinance_quote") return "yfinance quote";
  if (tool === "yfinance_history") return "yfinance history";
  if (tool === "news_search") return "News Search";
  return tool;
}

export function OpportunityDetail({
  day,
  score,
  evidenceNeeds = [],
  candidateOpportunities = [],
  onRunEvidenceTool,
}: OpportunityDetailProps) {
  const [evidenceToolResults, setEvidenceToolResults] = useState<ExternalEvidenceResult[]>([]);
  const [runningTool, setRunningTool] = useState("");
  const [toolError, setToolError] = useState("");

  if (!score) {
    return (
      <section
        aria-label="机会研究详情"
        className="opportunity-detail research-inspector opportunity-detail-empty"
      >
        <p>请在上方的评分列表中选择一个机会行，查看本地研究详情。</p>
        <p className="opportunity-detail-boundary">仅供研究观察，不是交易指令。</p>
      </section>
    );
  }

  const activeScore = score;
  const symbolNeeds = matchingEvidenceNeeds(activeScore.symbol, evidenceNeeds);
  const invalidationLines = matchingInvalidation(activeScore.symbol, candidateOpportunities);

  function buildEvidenceRequest(need: EvidenceNeed, tool: string): EvidenceToolActionRequest {
    if (tool === "news_search") {
      const query = need.kind === "fundamental"
        ? `${activeScore.symbol} earnings guidance filings`
        : `${activeScore.symbol} recent market news`;
      return { day, tool, symbol: activeScore.symbol, query };
    }

    if (tool === "yfinance_history") {
      return { day, tool, symbol: activeScore.symbol, period: "30d" };
    }

    return { day, tool, symbol: activeScore.symbol };
  }

  async function runEvidenceAction(need: EvidenceNeed, tool: string) {
    setRunningTool(tool);
    setToolError("");

    try {
      const result = await onRunEvidenceTool(buildEvidenceRequest(need, tool));
      setEvidenceToolResults((current) => [result, ...current].slice(0, 6));
    } catch (error) {
      setToolError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningTool("");
    }
  }

  return (
    <section
      aria-label={`${activeScore.symbol} 机会研究详情`}
      className="opportunity-detail research-inspector"
    >
      <div className="opportunity-detail-head">
        <div>
          <p className="eyebrow">Research Inspector</p>
          <h3>
            #{activeScore.rank.toString().padStart(2, "0")} {activeScore.symbol}
          </h3>
        </div>
        <span className="score-pill">{activeScore.score}</span>
      </div>

      <dl className="opportunity-detail-meta">
        <div>
          <dt>置信度</dt>
          <dd>{activeScore.confidence}</dd>
        </div>
        <div>
          <dt>来源引用</dt>
          <dd>{activeScore.sourceRefs.join(", ") || "-"}</dd>
        </div>
      </dl>

      <p className="opportunity-detail-reason">{activeScore.reason}</p>

      <div className="score-components">
        {(Object.keys(COMPONENT_LABELS) as Array<keyof OpportunityBoardScore["components"]>).map(
          (key) => (
            <article key={key}>
              <span>{COMPONENT_LABELS[key]}</span>
              <strong>{activeScore.components[key]}</strong>
            </article>
          ),
        )}
      </div>

      <section className="opportunity-detail-section">
        <h4>证据缺口</h4>
        {symbolNeeds.length ? (
          <ul className="opportunity-detail-needs">
            {symbolNeeds.map((need) => (
              <li key={`${need.kind}-${need.question}`}>
                <div>
                  <span>{need.kind}</span>
                  {need.required ? (
                    <em className="opportunity-detail-evidence-required">必需</em>
                  ) : null}
                </div>
                <p>{need.question}</p>
                {need.preferredTools.length ? (
                  <small>{need.preferredTools.join(", ")}</small>
                ) : null}
                <div className="evidence-action-row">
                  {need.preferredTools
                    .filter((tool) => ACTION_TOOL_NAMES.has(tool))
                    .map((tool) => (
                      <button
                        aria-busy={runningTool === tool}
                        className="evidence-action-button"
                        disabled={runningTool === tool}
                        key={`${need.kind}-${tool}`}
                        onClick={() => void runEvidenceAction(need, tool)}
                        type="button"
                      >
                        {runningTool === tool ? "请求证据中" : `补充证据：${toolLabel(tool)}`}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="opportunity-detail-muted">未记录该标的的明确证据需求。</p>
        )}
      </section>

      <section aria-live="polite" className="opportunity-detail-section">
        <h4>外部证据结果</h4>
        {toolError ? (
          <p className="agent-error" role="alert">
            {toolError}
          </p>
        ) : null}
        {evidenceToolResults.length ? (
          <div className="evidence-result-list">
            {evidenceToolResults.map((result, index) => (
              <article
                className="evidence-result-card"
                key={`${result.tool.name}-${index}-${result.tool.result_summary}`}
              >
                <div>
                  <strong>{toolLabel(result.tool.name)}</strong>
                  <span>{result.policy?.status ?? "executed"}</span>
                </div>
                <p>{result.tool.result_summary}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="opportunity-detail-muted">
            尚未请求外部证据。按钮只会调用受策略保护的本地 API，并返回摘要级 trace。
          </p>
        )}
      </section>

      <section className="opportunity-detail-section">
        <h4>失效条件</h4>
        {invalidationLines.length ? (
          <ul className="opportunity-detail-invalidation">
            {invalidationLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="opportunity-detail-muted">未记录该标的的明确失效条件。</p>
        )}
      </section>

      <p className="opportunity-detail-boundary">仅供研究观察，不是交易指令。</p>
    </section>
  );
}
