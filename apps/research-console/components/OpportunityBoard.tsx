"use client";

import { useEffect, useState } from "react";
import { ScoreRows } from "./ScoreRows";

type OpportunityBoardSummary = {
  day: string;
  status: {
    hasStructuredSummary: boolean;
    hasOpportunityObservation: boolean;
    hasSourceSummary: boolean;
    adminSymbolCount: number;
    adminCoreCount: number;
    riskCount: number;
    adminSymbolsPreview: string[];
    missing: string[];
    sourceSummaryPath: string;
  };
  scores: {
    rank: number;
    symbol: string;
    score: number;
    confidence: string;
    reason: string;
  }[];
  reasoning: {
    marketIntelNeeds: string[];
    nextChecks: string[];
    reasoningSummary: string[];
    candidateOpportunities: {
      symbol: string;
      sourceBasis: string[];
      invalidation: string[];
    }[];
  };
  riskSummary: {
    hasRiskContext: boolean;
    riskCount: number;
    maxLiquidityRisk: number;
    maxInvalidationClarity: number;
  };
};

type OpportunityBoardProps = {
  day: string;
  onDayChange: (day: string) => void;
};

export function OpportunityBoard({ day, onDayChange }: OpportunityBoardProps) {
  const [board, setBoard] = useState<OpportunityBoardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch(`/api/research/opportunities?day=${encodeURIComponent(day)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Opportunity board request failed: ${response.status}`);
        }
        setBoard((await response.json()) as OpportunityBoardSummary);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setBoard(null);
        setError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [day]);

  return (
    <section className="opportunity-board">
      <div className="opportunity-board-head">
        <div>
          <p className="eyebrow">Opportunity Board</p>
          <h2>当日机会面板</h2>
        </div>
        <label>
          日期
          <input value={day} onChange={(event) => onDayChange(event.target.value)} />
        </label>
      </div>

      {error ? <p className="agent-error">{error}</p> : null}

      <div className="opportunity-metrics">
        <article>
          <span>上下文</span>
          <strong>{loading ? "checking" : board?.status.missing.length ? "partial" : "ready"}</strong>
        </article>
        <article>
          <span>管理员标的</span>
          <strong>{board?.status.adminSymbolCount ?? 0}</strong>
        </article>
        <article>
          <span>核心理论</span>
          <strong>{board?.status.adminCoreCount ?? 0}</strong>
        </article>
        <article>
          <span>风险条件</span>
          <strong>{board?.riskSummary.riskCount ?? 0}</strong>
        </article>
      </div>

      {board?.status.adminSymbolsPreview.length ? (
        <div className="opportunity-watchlist">
          {board.status.adminSymbolsPreview.map((symbol) => (
            <span key={symbol}>{symbol}</span>
          ))}
        </div>
      ) : null}

      {board?.status.missing.length ? (
        <p className="opportunity-note">缺失：{board.status.missing.join(", ")}</p>
      ) : null}

      {board?.reasoning ? (
        <section className="reasoning-panel">
          <div className="reasoning-panel-head">
            <p className="eyebrow">Reasoning Plan</p>
            <h3>Staged opportunity research</h3>
          </div>
          <div className="reasoning-columns">
            <article>
              <strong>Reasoning summary</strong>
              <ul>
                {board.reasoning.reasoningSummary.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <strong>Market intel needs</strong>
              <ul>
                {board.reasoning.marketIntelNeeds.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <strong>Next checks</strong>
              <ul>
                {board.reasoning.nextChecks.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      ) : null}

      <ScoreRows rows={board?.scores ?? []} />
      <p className="opportunity-note">本地确定性研究分流，不是交易指令。</p>
    </section>
  );
}
