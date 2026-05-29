import type { AgentRunEvidenceSummary } from "@stock-summary/summary-core";
import type { AgentReply, AgentRunHistory as AgentRunHistoryData, ResearchPlanStep } from "../agent-panel-types";
import { formatBoundedPath, providerStatusLabel, researchPlanStatusLabel } from "../agent-panel-types";

type AgentTimelineProps = {
  reply: AgentReply | null;
  history: AgentRunHistoryData | null;
};

type TimelineStatus = "done" | "blocked" | "pending" | "process";

export const CORRUPTED_AGENT_TEXT_PLACEHOLDER = "内容疑似转码损坏，建议重新运行 Agent";

function latestRuns(history: AgentRunHistoryData | null): AgentRunEvidenceSummary[] {
  return (history?.runs ?? []).slice(0, 5);
}

export function looksCorruptedAgentText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  const questionCount = text.match(/\?/g)?.length ?? 0;
  return questionCount >= 6 && /\?{4,}/.test(text);
}

export function cleanAgentTimelineText(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "无预览";
  if (looksCorruptedAgentText(text)) return CORRUPTED_AGENT_TEXT_PLACEHOLDER;
  return text;
}

function toolStatusLabel(status: string | undefined) {
  if (status === "blocked") return "已阻断";
  if (status === "failed") return "失败";
  if (status === "pending_approval") return "待确认";
  if (status === "rejected") return "已拒绝";
  if (status === "approved") return "已批准";
  return "已执行";
}

function timelineStepStatus(step: ResearchPlanStep, reply: AgentReply): TimelineStatus {
  const executedTools = new Set(reply.tool_trace.map((tool) => tool.name));
  const blockedTools = new Set(
    reply.policy_decisions
      .filter((decision) => decision.status === "blocked")
      .map((decision) => decision.name),
  );

  if (step.toolHints.some((tool) => blockedTools.has(tool))) return "blocked";
  if (step.toolHints.some((tool) => executedTools.has(tool))) return "done";
  if (step.toolHints.length) return "pending";
  return "process";
}

function statusClass(status: TimelineStatus | string) {
  return `agent-timeline-status agent-timeline-status-${status}`;
}

export function AgentTimeline({ reply, history }: AgentTimelineProps) {
  const runs = latestRuns(history);
  const blockedTools = reply?.policy_decisions.filter((decision) => decision.status === "blocked") ?? [];
  const executedTools = reply?.tool_trace ?? [];
  const candidateSymbols = reply?.opportunity_reasoning.candidateOpportunities.map((candidate) => candidate.symbol) ?? [];

  return (
    <section
      className="agent-timeline"
      aria-label="Research Copilot Timeline"
      data-workflow-labels="plan step tool blocked/executed judgement summary invalidation note"
    >
      <div className="agent-timeline-head">
        <h3>Research Copilot Timeline</h3>
        <span>{reply ? providerStatusLabel(reply.provider_status) : `${runs.length} runs`}</span>
      </div>

      <div className="agent-timeline-summary" aria-label="当前运行">
        <article>
          <span>当前运行</span>
          <strong>{reply?.run_id ?? "等待提问"}</strong>
        </article>
        <article>
          <span>计划步骤</span>
          <strong>{reply?.planSteps.length ?? 0}</strong>
        </article>
        <article>
          <span>工具执行</span>
          <strong>{executedTools.length}</strong>
        </article>
        <article>
          <span>已阻断</span>
          <strong>{blockedTools.length}</strong>
        </article>
        <article>
          <span>候选标的</span>
          <strong>{candidateSymbols.length || "-"}</strong>
        </article>
      </div>

      {reply ? (
        <div className="agent-timeline-lanes">
          <article>
            <strong>计划步骤</strong>
            <ul>
              {reply.planSteps.slice(0, 5).map((step) => {
                const status = timelineStepStatus(step, reply);
                return (
                  <li className="agent-timeline-event" key={`${step.stage}-${step.title}`}>
                    <span>{step.title}</span>
                    <small className={statusClass(status)}>{researchPlanStatusLabel(status)}</small>
                    <p className="agent-timeline-step-question">{cleanAgentTimelineText(step.question)}</p>
                    <p className="agent-timeline-step-output">{cleanAgentTimelineText(step.expectedOutput)}</p>
                    {step.toolHints.length ? (
                      <div>
                        {step.toolHints.slice(0, 4).map((tool) => (
                          <em className="agent-timeline-tool-chip" key={tool}>{tool}</em>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
          <article>
            <strong>工具执行</strong>
            <ul>
              {executedTools.slice(0, 6).map((tool, index) => (
                <li className="agent-timeline-event" key={`${tool.name}-${index}`}>
                  <span>{tool.name}</span>
                  <small className={statusClass(tool.execution_status ?? "done")}>
                    {toolStatusLabel(tool.execution_status)}
                  </small>
                  <p className="agent-timeline-tool-reason">{cleanAgentTimelineText(tool.reason)}</p>
                  <p className="agent-timeline-tool-summary">{cleanAgentTimelineText(tool.result_summary)}</p>
                </li>
              ))}
              {blockedTools.slice(0, 4).map((decision) => (
                <li className="agent-timeline-event agent-timeline-blocked" key={`blocked-${decision.name}`}>
                  <span>{decision.name}</span>
                  <small className={statusClass("blocked")}>已阻断</small>
                  <p className="agent-timeline-tool-reason">{cleanAgentTimelineText(decision.reason)}</p>
                </li>
              ))}
              {!executedTools.length && !blockedTools.length ? (
                <li className="agent-timeline-event">
                  <span>暂无工具调用</span>
                  <small className={statusClass("pending")}>待执行</small>
                </li>
              ) : null}
            </ul>
          </article>
          <article>
            <strong>判断摘要</strong>
            <ul>
              {reply.marketJudgement.slice(0, 4).map((item, index) => (
                <li className="agent-timeline-event" key={`judgement-${index}`}>
                  {cleanAgentTimelineText(item)}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <strong>反证条件</strong>
            <ul>
              {reply.invalidation.slice(0, 4).map((item, index) => (
                <li className="agent-timeline-event" key={`invalidation-${index}`}>
                  {cleanAgentTimelineText(item)}
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : (
        <p className="agent-timeline-empty">还没有本轮 Agent run。选择一个机会后可快速生成反证计划。</p>
      )}

      {runs.length ? (
        <div className="agent-timeline-runs" aria-label="最近运行">
          <h4>最近运行</h4>
          {runs.map((run) => (
            <article className="agent-timeline-run-card" key={run.run_id}>
              <div>
                <strong>{run.run_id}</strong>
                <span>{providerStatusLabel(run.provider_status)}</span>
              </div>
              <p>{cleanAgentTimelineText(run.message_preview)}</p>
              {run.tool_names.length ? <small>已执行: {run.tool_names.join(" / ")}</small> : null}
              {run.blocked_tools.length ? <small>已阻断: {run.blocked_tools.join(" / ")}</small> : null}
              {run.candidate_symbols.length ? <small>候选标的: {run.candidate_symbols.join(" / ")}</small> : null}
            </article>
          ))}
        </div>
      ) : null}

      {history?.evidence_log_path ? (
        <p className="context-path">{formatBoundedPath(history.evidence_log_path)}</p>
      ) : null}
    </section>
  );
}
