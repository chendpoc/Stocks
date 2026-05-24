type ScoreComponents = {
  thesis_alignment: number;
  trigger_clarity: number;
  evidence_quality: number;
  invalidation_clarity: number;
  liquidity_risk: number;
};

type ScoreRow = {
  rank: number;
  symbol?: string;
  label?: string;
  score: number;
  confidence: string;
  reason: string;
  components?: ScoreComponents;
};

const COMPONENT_LABELS: Record<keyof ScoreComponents, string> = {
  thesis_alignment: "理论对齐",
  trigger_clarity: "触发清晰度",
  evidence_quality: "证据质量",
  invalidation_clarity: "失效清晰度",
  liquidity_risk: "流动性风险",
};

type ScoreRowsProps = {
  rows: ScoreRow[];
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
};

export function ScoreRows({ rows, selectedSymbol, onSelect }: ScoreRowsProps) {
  const selectable = Boolean(onSelect);

  if (!rows.length) {
    return <p className="score-empty">暂无可评分机会。</p>;
  }

  return (
    <div
      className="score-trace score-blotter"
      role={selectable ? "listbox" : undefined}
      aria-label={selectable ? "机会评分列表" : undefined}
    >
      {rows.map((row) => {
        const label = row.symbol || row.label || "UNKNOWN";
        const selected = selectedSymbol === label;
        const rowClassName = selected
          ? "score-row score-row-selected score-blotter-row"
          : "score-row score-blotter-row";

        return (
          <div
            className={rowClassName}
            key={`${row.rank}-${label}`}
            role={selectable ? "option" : undefined}
            aria-selected={selectable ? selected : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={selectable ? () => onSelect?.(label) : undefined}
            onKeyDown={
              selectable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(label);
                    }
                  }
                : undefined
            }
          >
            <div className="score-meta">
              <span>{row.rank.toString().padStart(2, "0")}</span>
              <strong>{label}</strong>
              <em>{row.confidence}</em>
            </div>
            <div
              className="score-meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.score}
              aria-label={`评分 ${row.score}，满分 100`}
            >
              <span className="score-meter-fill" style={{ width: `${row.score}%` }} />
            </div>
            <div className="score-detail">
              <span className="score-pill">{row.score}</span>
              <p className="score-reason">{row.reason}</p>
            </div>
            {row.components ? (
              <dl className="score-components">
                {(Object.keys(COMPONENT_LABELS) as Array<keyof ScoreComponents>).map((key) => (
                  <div key={key}>
                    <dt>{COMPONENT_LABELS[key]}</dt>
                    <dd>{row.components?.[key]}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="score-boundary">仅供研究观察，不是交易指令。</p>
          </div>
        );
      })}
    </div>
  );
}
