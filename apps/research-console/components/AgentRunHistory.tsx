import type { AgentRunEvidenceSummary } from "@stock-summary/summary-core";
import type { AgentRunHistory as AgentRunHistoryData } from "./agent-panel-types";
import { formatBoundedPath, providerStatusLabel } from "./agent-panel-types";

type AgentRunHistoryProps = {
  error: string;
  history: AgentRunHistoryData | null;
};

export function AgentRunHistory({ error, history }: AgentRunHistoryProps) {
  return (
    <section className="agent-run-list" aria-live="polite">
      <div className="context-status-head">
        <h3>历史运行</h3>
        <span>{history?.runs.length ?? 0} 次</span>
      </div>
      {error ? <p>{error}</p> : null}
      {history?.runs.length ? (
        <div className="agent-run-items">
          {history.runs.map((run: AgentRunEvidenceSummary) => (
            <article key={run.run_id}>
              <div className="agent-run-item-head">
                <strong>{run.run_id}</strong>
                <span>{providerStatusLabel(run.provider_status)}</span>
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
                    <span key={`${run.run_id}-blocked-${tool}`}>已阻断：{tool}</span>
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
      {history?.evidence_log_path ? (
        <p className="context-path">{formatBoundedPath(history.evidence_log_path)}</p>
      ) : null}
    </section>
  );
}
