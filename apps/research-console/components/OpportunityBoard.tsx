"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OpportunityBoardSummary, ResearchSession } from "@stock-summary/summary-core";
import { OpportunityBlotter } from "./research/OpportunityBlotter";
import {
  ResearchInspector,
  type EvidenceToolActionRequest,
  type ExternalEvidenceResult,
} from "./research/ResearchInspector";
import {
  buildInspectorView,
  buildOpportunityRows,
  filterOpportunityRows,
  type OpportunityFilterState,
} from "./research/opportunity-view-model";
import { Badge } from "./ui/badge";

const MISSING_LABELS: Record<string, string> = {
  structured_summary: "结构化摘要",
  opportunity_observation: "机会观察",
  local_summary_markdown: "本地总结",
};

const DEFAULT_FILTER_STATE: OpportunityFilterState = {
  query: "",
  status: "all",
  confidence: "all",
  missingEvidenceOnly: false,
  toolAvailability: "all",
};

export type PendingEvidenceAction = {
  id: number;
  symbol: string;
  tool: string;
  label: string;
};

export type PendingReviewCommand = { id: number; symbol: string; source?: "command-palette" | "review-ledger"; reviewId?: string };

function formatMissingNote(missing: string[]) {
  const labels = missing.map((item) => MISSING_LABELS[item] ?? item);
  return `缺少以下上下文：${labels.join("、")}。本地评分可能不完整。`;
}

type OpportunityBoardProps = {
  day: string;
  filter: string;
  session?: ResearchSession | null;
  selectedSymbol: string | null;
  pendingEvidenceAction?: PendingEvidenceAction | null;
  pendingReviewCommand?: PendingReviewCommand | null;
  onSelectedSymbolChange: (symbol: string | null) => void;
  onPendingEvidenceActionHandled?: (id: number) => void;
  onAgentPrompt?: (command: { text: string; source?: string; symbol?: string; promptType?: string; day?: string }) => void;
  onSessionRefresh?: () => Promise<void>;
};

export function OpportunityBoard({
  day,
  filter,
  session = null,
  selectedSymbol,
  pendingEvidenceAction,
  pendingReviewCommand,
  onSelectedSymbolChange,
  onPendingEvidenceActionHandled,
  onAgentPrompt,
  onSessionRefresh,
}: OpportunityBoardProps) {
  const [board, setBoard] = useState<OpportunityBoardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterState, setFilterState] = useState<OpportunityFilterState>(DEFAULT_FILTER_STATE);
  const [commandActionStatus, setCommandActionStatus] = useState("");

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
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setBoard(null);
        setError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [day]);

  const activeFilterState = useMemo(
    () => ({ ...filterState, query: filter }),
    [filter, filterState],
  );

  const allRows = useMemo(
    () => buildOpportunityRows({ board, session }),
    [board, session],
  );

  const visibleRows = useMemo(
    () => filterOpportunityRows(allRows, activeFilterState),
    [activeFilterState, allRows],
  );

  const firstSelectableSymbol = visibleRows[0]?.symbol ?? null;

  useEffect(() => {
    if (!board) {
      onSelectedSymbolChange(null);
      return;
    }

    if (selectedSymbol && visibleRows.some((row) => row.symbol === selectedSymbol)) {
      return;
    }

    onSelectedSymbolChange(firstSelectableSymbol);
  }, [board, firstSelectableSymbol, onSelectedSymbolChange, selectedSymbol, visibleRows]);

  const selectedRow = useMemo(
    () => visibleRows.find((row) => row.symbol === selectedSymbol)
      ?? allRows.find((row) => row.symbol === selectedSymbol)
      ?? visibleRows[0]
      ?? null,
    [allRows, selectedSymbol, visibleRows],
  );

  const inspectorView = useMemo(
    () => buildInspectorView(selectedRow, session),
    [selectedRow, session],
  );

  const runEvidenceTool = useCallback(async (request: EvidenceToolActionRequest): Promise<ExternalEvidenceResult> => {
    const response = await fetch("/api/research/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = (await response.json()) as ExternalEvidenceResult & { error?: string };
    if (!response.ok && !payload.tool) {
      throw new Error(payload.error || `Evidence request failed: ${response.status}`);
    }
    await onSessionRefresh?.();
    return payload;
  }, [onSessionRefresh]);

  useEffect(() => {
    if (!pendingEvidenceAction) return;
    const commandId = pendingEvidenceAction.id;
    const commandRows = allRows;
    const row = commandRows.find((item) => item.symbol === pendingEvidenceAction.symbol);

    if (!row) {
      setCommandActionStatus(`未找到 ${pendingEvidenceAction.symbol} 的 ${pendingEvidenceAction.tool} 证据动作。`);
      onPendingEvidenceActionHandled?.(commandId);
      return;
    }

    setCommandActionStatus(`已将 ${row.symbol} / ${pendingEvidenceAction.label} 转到右侧 Inspector。`);
    onSelectedSymbolChange(row.symbol);
  }, [
    allRows,
    onPendingEvidenceActionHandled,
    onSelectedSymbolChange,
    pendingEvidenceAction,
  ]);

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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={board?.status.missing.length ? "warning" : "success"}>
            {contextStatus}
          </Badge>
          {filter ? <Badge variant="secondary">过滤：{filter}</Badge> : null}
          <Badge variant="secondary">rows {visibleRows.length}</Badge>
        </div>
      </div>

      {error ? <p className="agent-error opportunity-board-error">{error}</p> : null}
      {commandActionStatus ? <p className="opportunity-note opportunity-command-status">{commandActionStatus}</p> : null}

      <div className="opportunity-metrics">
        <article>
          <span>上下文</span>
          <strong>{contextStatus}</strong>
        </article>
        <article>
          <span>机会数量</span>
          <strong>{board?.scores.length ?? 0}</strong>
        </article>
        <article>
          <span>证据缺口</span>
          <strong>{visibleRows.reduce((total, row) => total + row.evidenceGapCount, 0)}</strong>
        </article>
        <article>
          <span>复盘记录</span>
          <strong>{session?.reviewRecords.length ?? 0}</strong>
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

      <div className="opportunity-workbench-grid opportunity-workbench-grid-pro">
        <div className="opportunity-blotter-list">
          {loading ? (
            <p className="score-empty">加载评分中...</p>
          ) : error ? null : showEmptyScores ? (
            <p className="score-empty opportunity-board-empty">暂无可评分机会。</p>
          ) : (
            <OpportunityBlotter
              allRows={allRows}
              rows={visibleRows}
              selectedSymbol={selectedSymbol}
              filterState={activeFilterState}
              onSelectedSymbolChange={onSelectedSymbolChange}
              onFilterStateChange={setFilterState}
            />
          )}
        </div>

        <ResearchInspector
          day={day}
          pendingEvidenceAction={pendingEvidenceAction}
          view={inspectorView}
          onPendingEvidenceActionHandled={onPendingEvidenceActionHandled}
          onAgentPrompt={onAgentPrompt}
          onRunEvidenceTool={runEvidenceTool}
          onSessionRefresh={onSessionRefresh}
          reviewCommandId={pendingReviewCommand?.symbol === selectedSymbol ? pendingReviewCommand.id : undefined}
          reviewCommandReviewId={pendingReviewCommand?.reviewId}
          reviewCommandSource={pendingReviewCommand?.source}
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
