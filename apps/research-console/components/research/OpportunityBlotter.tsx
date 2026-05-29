import { useRef } from "react";
import { Badge } from "../ui/badge";
import {
  filterOpportunityRows,
  type OpportunityFilterState,
  type OpportunityRowView,
} from "./opportunity-view-model";

type OpportunityBlotterProps = {
  allRows: OpportunityRowView[];
  rows: OpportunityRowView[];
  selectedSymbol: string | null;
  filterState: OpportunityFilterState;
  onSelectedSymbolChange: (symbol: string | null) => void;
  onFilterStateChange?: (filter: OpportunityFilterState) => void;
};

function statusVariant(tone: OpportunityRowView["statusTone"]) {
  if (tone === "ready") return "success";
  if (tone === "warning") return "warning";
  if (tone === "blocked") return "destructive";
  return "secondary";
}

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "needs_evidence", label: "待补证据" },
  { value: "evidence_ready", label: "证据已刷新" },
  { value: "watching", label: "观察中" },
  { value: "invalidated", label: "已失效" },
  { value: "reviewed", label: "已复盘" },
] as const;

const CONFIDENCE_OPTIONS = [
  { value: "all", label: "全部置信度" },
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" },
] as const;

const TOOL_OPTIONS = [
  { value: "all", label: "全部工具" },
  { value: "has-tools", label: "has-tools" },
  { value: "blocked", label: "blocked" },
  { value: "cached", label: "cached" },
] as const;

function activeFilterSummary(filterState: OpportunityFilterState, visibleCount: number, totalCount: number) {
  const activeFilters = [];
  if (filterState.query.trim()) activeFilters.push(`query ${filterState.query.trim()}`);
  if (filterState.status !== "all") activeFilters.push(`status ${filterState.status}`);
  if (filterState.confidence !== "all") activeFilters.push(`confidence ${filterState.confidence}`);
  if (filterState.toolAvailability !== "all") activeFilters.push(`tool ${filterState.toolAvailability}`);
  if (filterState.missingEvidenceOnly) activeFilters.push("missing evidence");

  return activeFilters.length
    ? `${visibleCount}/${totalCount} rows · ${activeFilters.join(" · ")}`
    : `${visibleCount}/${totalCount} rows · 全部机会`;
}

function filterCountBy(
  rows: OpportunityRowView[],
  filterState: OpportunityFilterState,
  nextFilter: Partial<OpportunityFilterState>,
) {
  return filterOpportunityRows(rows, { ...filterState, ...nextFilter }).length;
}

function moveSelection(
  rows: OpportunityRowView[],
  currentSymbol: string | null,
  direction: 1 | -1,
  onSelectedSymbolChange: (symbol: string | null) => void,
  focusOpportunityRow: (symbol: string) => void,
) {
  if (!rows.length) return;
  const currentIndex = rows.findIndex((row) => row.symbol === currentSymbol);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = Math.max(0, Math.min(rows.length - 1, safeIndex + direction));
  const nextSymbol = rows[nextIndex]?.symbol ?? null;
  onSelectedSymbolChange(nextSymbol);
  if (nextSymbol) focusOpportunityRow(nextSymbol);
}

export function OpportunityBlotter({
  allRows,
  rows,
  selectedSymbol,
  filterState,
  onSelectedSymbolChange,
  onFilterStateChange,
}: OpportunityBlotterProps) {
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  function updateFilter(nextFilter: Partial<OpportunityFilterState>) {
    onFilterStateChange?.({ ...filterState, ...nextFilter });
  }

  function resetOpportunityFilters() {
    onFilterStateChange?.({
      ...filterState,
      confidence: "all",
      missingEvidenceOnly: false,
      status: "all",
      toolAvailability: "all",
    });
  }

  function focusOpportunityRow(symbol: string) {
    const row = rowRefs.current[symbol];
    row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    row?.focus({ preventScroll: true });
  }

  if (!allRows.length) {
    return <p className="score-empty opportunity-board-empty">暂无匹配机会。请清除过滤或切换研究日期。</p>;
  }

  const hasLocalFilters = filterState.status !== "all"
    || filterState.confidence !== "all"
    || filterState.toolAvailability !== "all"
    || filterState.missingEvidenceOnly;
  const summary = activeFilterSummary(filterState, rows.length, allRows.length);
  const missingEvidenceCount = filterCountBy(allRows, filterState, {
    missingEvidenceOnly: true,
  });

  return (
    <section className="opportunity-blotter-panel" aria-label="Research Blotter">
      <div className="opportunity-blotter-toolbar">
        <div className="opportunity-filter-summary">
          <span>rank / symbol / score / confidence</span>
          <strong>筛选结果：{summary}</strong>
        </div>
        <div className="opportunity-filter-pills opportunity-filter-controls" aria-label="基础筛选">
          <button
            aria-pressed={filterState.missingEvidenceOnly}
            className="filter-chip-button filter-chip-button-priority"
            disabled={!onFilterStateChange}
            type="button"
            onClick={() => updateFilter({ missingEvidenceOnly: !filterState.missingEvidenceOnly })}
          >
            证据缺口 <span>{missingEvidenceCount}</span>
          </button>
          <div className="opportunity-filter-chip-group" aria-label="状态筛选">
            {STATUS_OPTIONS.map((option) => (
              <button
                aria-label={`筛选状态：${option.label}`}
                aria-pressed={filterState.status === option.value}
                className="filter-chip-button"
                disabled={!onFilterStateChange}
                key={option.value}
                type="button"
                onClick={() => updateFilter({ status: option.value })}
              >
                {option.label}
                <span>{filterCountBy(allRows, filterState, { status: option.value })}</span>
              </button>
            ))}
          </div>
          <div className="opportunity-filter-chip-group" aria-label="置信度筛选">
            {CONFIDENCE_OPTIONS.map((option) => (
              <button
                aria-label={`筛选置信度：${option.label}`}
                aria-pressed={filterState.confidence === option.value}
                className="filter-chip-button"
                disabled={!onFilterStateChange}
                key={option.value}
                type="button"
                onClick={() => updateFilter({ confidence: option.value })}
              >
                {option.label}
                <span>{filterCountBy(allRows, filterState, { confidence: option.value })}</span>
              </button>
            ))}
          </div>
          <div className="opportunity-filter-chip-group" aria-label="工具筛选">
            {TOOL_OPTIONS.map((option) => (
              <button
                aria-label={`筛选工具：${option.label}`}
                aria-pressed={filterState.toolAvailability === option.value}
                className="filter-chip-button"
                disabled={!onFilterStateChange}
                key={option.value}
                type="button"
                onClick={() => updateFilter({ toolAvailability: option.value })}
              >
                {option.label}
                <span>{filterCountBy(allRows, filterState, { toolAvailability: option.value })}</span>
              </button>
            ))}
          </div>
          {filterState.missingEvidenceOnly ? (
            <Badge variant="warning">missing evidence</Badge>
          ) : null}
          {hasLocalFilters && onFilterStateChange ? (
            <button
              className="opportunity-filter-inline-button"
              type="button"
              onClick={resetOpportunityFilters}
            >
              重置筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className="opportunity-blotter-table-wrap">
        <table className="opportunity-blotter-table" aria-label="rank / symbol / score / confidence research status evidence gap table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Symbol</th>
              <th scope="col">Score</th>
              <th scope="col">Confidence</th>
              <th scope="col">Research status</th>
              <th scope="col">Evidence gap</th>
              <th scope="col">Key thesis</th>
              <th scope="col">Last evidence</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => {
              const selected = selectedSymbol === row.symbol;
              return (
                <tr
                  aria-selected={selected}
                  className={selected ? "opportunity-blotter-row is-selected" : "opportunity-blotter-row"}
                  key={`${row.rank}-${row.symbol}`}
                  onClick={() => onSelectedSymbolChange(row.symbol)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectedSymbolChange(row.symbol);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveSelection(rows, row.symbol, 1, onSelectedSymbolChange, focusOpportunityRow);
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveSelection(rows, row.symbol, -1, onSelectedSymbolChange, focusOpportunityRow);
                    }
                  }}
                  ref={(element) => {
                    rowRefs.current[row.symbol] = element;
                  }}
                  tabIndex={selected ? 0 : -1}
                >
                  <td className="blotter-rank">{row.rank.toString().padStart(2, "0")}</td>
                  <td>
                    <strong>{row.symbol}</strong>
                  </td>
                  <td>
                    <span className="score-pill">{row.score}</span>
                  </td>
                  <td>{row.confidence}</td>
                  <td>
                    <Badge variant={statusVariant(row.statusTone)}>{row.statusLabel}</Badge>
                  </td>
                  <td className={row.evidenceGapCount ? "evidence-gap-cell has-gap" : "evidence-gap-cell"}>
                    {row.evidenceGapLabel}
                  </td>
                  <td className="blotter-thesis">{row.keyThesis}</td>
                  <td className="blotter-last-evidence">{row.lastEvidenceLabel}</td>
                  <td className={row.latestReview ? "blotter-review has-review" : "blotter-review"}>
                    <Badge variant={row.latestReview ? "secondary" : "outline"}>{row.latestReviewLabel}</Badge>
                    {row.latestReviewAt ? <small>{row.latestReviewAt}</small> : null}
                    {row.latestReviewLearning ? <span>{row.latestReviewLearning}</span> : null}
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td className="opportunity-blotter-empty-cell" colSpan={9}>
                  当前筛选没有匹配机会。请清除局部筛选，或清除顶部 symbol/query 过滤。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
