type ScoreRow = {
  rank: number;
  symbol?: string;
  label?: string;
  score: number;
  confidence: string;
  reason: string;
};

export function ScoreRows({ rows }: { rows: ScoreRow[] }) {
  if (!rows.length) {
    return <p className="score-empty">暂无可评分的管理员标的。</p>;
  }

  return (
    <div className="score-trace">
      {rows.map((row) => {
        const label = row.symbol || row.label || "UNKNOWN";
        return (
          <div className="score-row" key={`${row.rank}-${label}`}>
            <div className="score-meta">
              <span>{row.rank.toString().padStart(2, "0")}</span>
              <strong>{label}</strong>
              <em>{row.confidence}</em>
            </div>
            <div className="score-meter" aria-label={`${row.score} out of 100`}>
              <span className="score-meter-fill" style={{ width: `${row.score}%` }} />
            </div>
            <div className="score-detail">
              <span className="score-pill">{row.score}</span>
              <p>{row.reason}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
