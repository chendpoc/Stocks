import type { ResearchContextStatus } from "./agent-panel-types";
import { formatBoundedPath, providerStatusLabel } from "./agent-panel-types";

type AgentContextStatusProps = {
  loading: boolean;
  error: string;
  status: ResearchContextStatus | null;
};

export function AgentContextStatus({ loading, error, status }: AgentContextStatusProps) {
  const badge = loading
    ? "checking"
    : status?.missing.length
      ? "partial"
      : "ready";

  return (
    <section className="context-status" aria-live="polite">
      <div className="context-status-head">
        <h3>上下文预检</h3>
        <span>{providerStatusLabel(badge)}</span>
      </div>
      {error ? <p>{error}</p> : null}
      {status ? (
        <>
          <dl>
            <div>
              <dt>结构化日报</dt>
              <dd>{status.hasStructuredSummary ? "可用" : "缺失"}</dd>
            </div>
            <div>
              <dt>机会观察</dt>
              <dd>{status.hasOpportunityObservation ? "可用" : "缺失"}</dd>
            </div>
            <div>
              <dt>本地总结</dt>
              <dd>{status.hasSourceSummary ? "可用" : "缺失"}</dd>
            </div>
          </dl>
          <p>
            管理员标的 {status.adminSymbolCount} 个，核心理论 {status.adminCoreCount} 条，
            风险 {status.riskCount} 条
          </p>
          <p>
            选择状态 {status.selectedDayStatus}；可用日期 {status.availableDays.slice(0, 5).join(" / ") || "无"}
          </p>
          {status.sourceStatuses.length ? (
            <div className="context-source-list">
              {status.sourceStatuses.map((source) => (
                <span className={source.available ? "source-ready" : "source-missing"} key={source.key}>
                  {source.label}: {source.available ? "可用" : "缺失"}
                </span>
              ))}
            </div>
          ) : null}
          {status.adminSymbolsPreview.length ? (
            <div className="context-symbols">
              {status.adminSymbolsPreview.map((symbol) => (
                <span key={symbol}>{symbol}</span>
              ))}
            </div>
          ) : null}
          <p className="context-path">{formatBoundedPath(status.sourceSummaryPath)}</p>
        </>
      ) : null}
    </section>
  );
}
