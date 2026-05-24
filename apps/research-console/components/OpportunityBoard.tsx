"use client";

import { useEffect, useMemo, useState } from "react";
import type { OpportunityBoardSummary } from "@stock-summary/summary-core";
import {
  OpportunityDetail,
  type EvidenceToolActionRequest,
  type ExternalEvidenceResult,
} from "./OpportunityDetail";
import { ScoreRows } from "./ScoreRows";

const MISSING_LABELS: Record<string, string> = {
  structured_summary: "结构化摘要",
  opportunity_observation: "机会观察",
  local_summary_markdown: "本地总结",
};

function formatMissingNote(missing: string[]) {
  const labels = missing.map((item) => MISSING_LABELS[item] ?? item);
  return `缺少以下上下文：${labels.join("、")}。本地评分可能不完整。`;
}

type OpportunityBoardProps = {
  day: string;
  onDayChange: (day: string) => void;
  onEvidenceRecorded?: () => void;
};

export function OpportunityBoard({ day, onDayChange, onEvidenceRecorded }: OpportunityBoardProps) {
  const [board, setBoard] = useState<OpportunityBoardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

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
        const nextBoard = (await response.json()) as OpportunityBoardSummary;
        setBoard(nextBoard);
        if (!day && nextBoard.day) {
          onDayChange(nextBoard.day);
        }
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setBoard(null);
        setError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    if (!board) {
      setSelectedSymbol(null);
      return;
    }

    if (!selectedSymbol) return;

    const stillExists = board.scores.some((score) => score.symbol === selectedSymbol);
    if (!stillExists) {
      setSelectedSymbol(null);
    }
  }, [board, selectedSymbol]);

  const selectedScore = useMemo(
    () => board?.scores.find((score) => score.symbol === selectedSymbol) ?? null,
    [board, selectedSymbol],
  );

  async function runEvidenceTool(request: EvidenceToolActionRequest): Promise<ExternalEvidenceResult> {
    const response = await fetch("/api/research/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as ExternalEvidenceResult & { error?: string };
    if (!response.ok && !payload.tool) {
      throw new Error(payload.error || `Evidence request failed: ${response.status}`);
    }
    onEvidenceRecorded?.();
    return payload;
  }

  const contextStatus = loading
    ? "加载中"
    : board?.status.missing.length
      ? "部分就绪"
      : "就绪";

  const showEmptyScores = !loading && !error && board && board.scores.length === 0;
  const reasoningSignalCount = board?.reasoning
    ? board.reasoning.reasoningSummary.length
      + board.reasoning.marketIntelNeeds.length
      + board.reasoning.nextChecks.length
    : 0;

  return (
    <section aria-label="机会池" className="opportunity-board opportunity-blotter">
      <div className="opportunity-board-head">
        <div>
          <p className="eyebrow">Opportunity Blotter</p>
          <h2>机会池</h2>
          <p className="opportunity-day-label">所选日期：{day}</p>
        </div>
        <label htmlFor="opportunity-board-day">
          日期
          <input
            id="opportunity-board-day"
            name="opportunity-board-day"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="agent-error opportunity-board-error">{error}</p> : null}

      <div className="opportunity-metrics">
        <article>
          <span>上下文</span>
          <strong>{contextStatus}</strong>
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
        <p className="opportunity-note opportunity-note-missing">
          {formatMissingNote(board.status.missing)}
        </p>
      ) : null}

      {board?.status.sourceStatuses.length ? (
        <div className="opportunity-source-grid" aria-label="资料来源状态">
          {board.status.sourceStatuses.map((source) => (
            <article className={source.available ? "source-ready" : "source-missing"} key={source.key}>
              <span>{source.label}</span>
              <strong>{source.available ? "可用" : "缺失"}</strong>
              <small>{source.resolvedPath ?? source.path}</small>
            </article>
          ))}
        </div>
      ) : null}

      <div className="opportunity-workbench-grid">
        <div className="opportunity-blotter-list">
          {loading ? (
            <p className="score-empty">加载评分中…</p>
          ) : error ? null : showEmptyScores ? (
            <p className="score-empty opportunity-board-empty">暂无可评分机会。</p>
          ) : (
            <ScoreRows
              rows={board?.scores ?? []}
              selectedSymbol={selectedSymbol}
              onSelect={setSelectedSymbol}
            />
          )}
        </div>

        <OpportunityDetail
          day={day}
          score={selectedScore}
          evidenceNeeds={board?.reasoning.evidenceNeeds}
          candidateOpportunities={board?.reasoning.candidateOpportunities}
          onRunEvidenceTool={runEvidenceTool}
        />
      </div>

      {board?.reasoning ? (
        <details className="reasoning-panel">
          <summary className="reasoning-panel-head">
            <span>
              <span className="eyebrow">Research Plan</span>
              <strong>本地推演计划</strong>
            </span>
            <span className="reasoning-panel-count">{reasoningSignalCount} 条辅助线索</span>
          </summary>
          <div className="reasoning-columns">
            <article>
              <strong>推理摘要</strong>
              <ul>
                {board.reasoning.reasoningSummary.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <strong>市场情报需求</strong>
              <ul>
                {board.reasoning.marketIntelNeeds.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article>
              <strong>下一步检查</strong>
              <ul>
                {board.reasoning.nextChecks.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </details>
      ) : null}

      <p className="opportunity-note">本地确定性研究分流，不是交易指令。</p>
    </section>
  );
}
