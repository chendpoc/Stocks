"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { parseAgentAnswerSections } from "../lib/agent-answer-sections";
import { AgentContextStatus } from "./AgentContextStatus";
import { AgentEvidenceDetail, AgentToolTraceSection } from "./AgentEvidenceDetail";
import { AgentRunHistory } from "./AgentRunHistory";
import { AgentToolPolicy } from "./AgentToolPolicy";
import { AgentTimeline } from "./research/AgentTimeline";
import type {
  AgentReply,
  AgentRunHistory as AgentRunHistoryData,
  ChatMessage,
  ResearchContextStatus,
  ResearchPlanStatus,
  ResearchPlanStep,
  ResearchToolReadiness,
  ToolTrace,
} from "./agent-panel-types";
import {
  formatBoundedPath,
  providerStatusLabel,
  researchPlanStatusLabel,
} from "./agent-panel-types";

type AgentPanelProps = {
  day: string;
  selectedSymbol?: string | null;
  promptCommand?: { id: number; text: string; source?: string; symbol?: string; promptType?: string; day?: string } | null;
  onStatusChange?: (status: AgentRailStatus) => void;
};

type AgentRailStatus = {
  label: string;
  tone: "idle" | "running" | "ready" | "error";
  detail: string;
  runId?: string;
};

type AgentPromptMeta = {
  source: string;
  symbol: string;
  promptType: string;
  day: string;
};

const AGENT_QUICK_ACTIONS = [
  {
    id: "invalidate",
    label: "反证当前机会",
    description: "列出最该验证的失效条件",
  },
  {
    id: "evidence",
    label: "证据缺口清单",
    description: "生成下一步工具检查顺序",
  },
  {
    id: "market",
    label: "市场状态摘要",
    description: "压缩当前市场和机会优先级",
  },
] as const;

type AgentQuickActionId = typeof AGENT_QUICK_ACTIONS[number]["id"];

function buildAgentPrompt(actionId: AgentQuickActionId, selectedSymbol: string | null | undefined, day: string) {
  const symbol = selectedSymbol ?? "当前机会";
  if (actionId === "invalidate") {
    return `基于 ${day} 的研究上下文，优先反证 ${symbol}：列出最关键的失效条件、需要的证据和下一步观察。`;
  }
  if (actionId === "evidence") {
    return `为 ${symbol} 生成证据缺口清单：按 quote、history、news、fundamental 排序，并说明哪些工具会被阻断或需要人工复核。`;
  }
  return `总结 ${day} 的市场状态和 ${symbol} 的机会优先级：只给研究判断、置信度和反证条件。`;
}

function researchPlanStepStatus(
  step: ResearchPlanStep,
  reply: AgentReply,
): { status: ResearchPlanStatus; tools: string[] } {
  const executedTools = new Set(reply.tool_trace.map((tool) => tool.name));
  const blockedTools = new Set(
    reply.policy_decisions
      .filter((decision) => decision.status === "blocked")
      .map((decision) => decision.name),
  );

  if (step.toolHints.some((tool) => blockedTools.has(tool))) {
    return {
      status: "blocked",
      tools: step.toolHints.filter((tool) => blockedTools.has(tool)),
    };
  }

  if (step.toolHints.some((tool) => executedTools.has(tool))) {
    return {
      status: "done",
      tools: step.toolHints.filter((tool) => executedTools.has(tool)),
    };
  }

  if (step.toolHints.length) {
    return { status: "pending", tools: step.toolHints };
  }

  return { status: "process", tools: [] };
}

function extractTickerSymbol(value: string | undefined) {
  return value?.match(/\b[A-Z][A-Z0-9.-]{0,9}\b/)?.[0] ?? "";
}

function AgentAnswerBody({ answer }: { answer: string }) {
  const sections = parseAgentAnswerSections(answer);
  if (!sections.length) {
    return <p className="agent-answer-text">{answer}</p>;
  }

  return (
    <div className="agent-answer-sections">
      {sections.map((section, index) => (
        <article className="agent-answer-section-card" key={`${section.title}-${index}`}>
          <h4>{section.title}</h4>
          <p>{section.body}</p>
        </article>
      ))}
    </div>
  );
}

function LocalCliRunner() {
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("30000");
  const [envKeys, setEnvKeys] = useState("");
  const [trace, setTrace] = useState<ToolTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(action: "preview" | "approve" | "reject") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/research/cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, command, args, cwd, timeoutMs, envKeys }),
      });
      const payload = (await response.json()) as { tool?: ToolTrace; error?: string };
      if (!response.ok || !payload.tool) {
        throw new Error(payload.error || `CLI request failed: ${response.status}`);
      }
      setTrace(payload.tool);
    } catch (rawError) {
      setError(rawError instanceof Error ? rawError.message : String(rawError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="local-cli-runner" aria-label="本地 CLI 执行器">
      <div className="context-status-head">
        <h3>本地 CLI</h3>
        <span>{trace?.execution_status ?? "idle"}</span>
      </div>
      <label>
        命令
        <input value={command} onChange={(event) => setCommand(event.target.value)} />
      </label>
      <label>
        参数
        <input value={args} onChange={(event) => setArgs(event.target.value)} />
      </label>
      <div className="cli-runner-row">
        <label>
          cwd
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} />
        </label>
        <label>
          timeout
          <input value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value)} />
        </label>
      </div>
      <label>
        env keys
        <input value={envKeys} onChange={(event) => setEnvKeys(event.target.value)} />
      </label>
      <div className="agent-quick-actions">
        <button disabled={loading || !command.trim()} type="button" onClick={() => void run("preview")}>
          预览
        </button>
        <button disabled={loading || !trace?.approval_required} type="button" onClick={() => void run("approve")}>
          确认执行
        </button>
        <button disabled={loading || !trace?.approval_required} type="button" onClick={() => void run("reject")}>
          拒绝
        </button>
      </div>
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      {trace ? (
        <article className={`cli-trace cli-trace-${trace.execution_status ?? "idle"}`}>
          <strong>{trace.command_preview}</strong>
          <span>{trace.cwd}</span>
          {trace.env_keys?.length ? <small>env: {trace.env_keys.join(", ")}</small> : null}
          <p>{trace.result_summary}</p>
        </article>
      ) : null}
    </section>
  );
}

export function AgentPanel({ day, selectedSymbol, promptCommand, onStatusChange }: AgentPanelProps) {
  const [message, setMessage] = useState("基于今天的机会观察，哪些假设最需要反证？");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [runHistory, setRunHistory] = useState<AgentRunHistoryData | null>(null);
  const [contextStatus, setContextStatus] = useState<ResearchContextStatus | null>(null);
  const [toolReadiness, setToolReadiness] = useState<ResearchToolReadiness[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [runError, setRunError] = useState("");
  const [toolError, setToolError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promptMeta, setPromptMeta] = useState<AgentPromptMeta | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (loading) {
      onStatusChange?.({
        label: "运行中",
        tone: "running",
        detail: selectedSymbol ? `分析 ${selectedSymbol}` : day || "当前研究日",
      });
      return;
    }
    if (error || runError || toolError) {
      onStatusChange?.({
        label: "异常",
        tone: "error",
        detail: error || runError || toolError,
      });
      return;
    }
    if (reply) {
      onStatusChange?.({
        label: providerStatusLabel(reply.provider_status),
        tone: "ready",
        detail: reply.provider,
        runId: reply.run_id,
      });
      return;
    }
    const latestRun = runHistory?.runs[0];
    if (latestRun) {
      onStatusChange?.({
        label: "最近运行",
        tone: "ready",
        detail: providerStatusLabel(latestRun.provider_status),
        runId: latestRun.run_id,
      });
      return;
    }
    onStatusChange?.({
      label: "就绪",
      tone: "idle",
      detail: selectedSymbol ? `等待 ${selectedSymbol} prompt` : "等待提问",
    });
  }, [
    day,
    error,
    loading,
    onStatusChange,
    reply,
    runError,
    runHistory?.runs,
    selectedSymbol,
    toolError,
  ]);

  useEffect(() => {
    if (promptCommand?.text) {
      setMessage(promptCommand.text);
      setPromptMeta({
        source: promptCommand.source ?? "Manual",
        symbol: promptCommand.symbol ?? selectedSymbol ?? "未指定",
        promptType: promptCommand.promptType ?? "custom",
        day: promptCommand.day ?? day,
      });
      window.requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }
  }, [day, promptCommand?.day, promptCommand?.id, promptCommand?.promptType, promptCommand?.source, promptCommand?.symbol, promptCommand?.text, selectedSymbol]);

  async function loadRunHistory(signal?: AbortSignal) {
    setRunError("");
    const response = await fetch(`/api/agent/runs?day=${encodeURIComponent(day)}`, { signal });
    if (!response.ok) {
      throw new Error(`Agent run history request failed: ${response.status}`);
    }
    setRunHistory((await response.json()) as AgentRunHistoryData);
  }

  useEffect(() => {
    const controller = new AbortController();
    setContextLoading(true);
    setContextError("");

    fetch(`/api/research/context?day=${encodeURIComponent(day)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Context request failed: ${response.status}`);
        }
        setContextStatus((await response.json()) as ResearchContextStatus);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setContextStatus(null);
        setContextError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setContextLoading(false));

    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    const controller = new AbortController();

    loadRunHistory(controller.signal)
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setRunHistory(null);
        setRunError(rawError instanceof Error ? rawError.message : String(rawError));
      });

    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    const controller = new AbortController();
    setToolError("");

    fetch("/api/research/tools", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Tool readiness request failed: ${response.status}`);
        }
        const payload = (await response.json()) as { tools?: ResearchToolReadiness[] };
        setToolReadiness(payload.tools ?? []);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setToolReadiness([]);
        setToolError(rawError instanceof Error ? rawError.message : String(rawError));
      });

    return () => controller.abort();
  }, []);

  function evidenceRefreshPrompt() {
    const evidenceSymbol = reply?.opportunity_reasoning.evidenceNeeds
      .find((need) => need.symbol !== "GENERAL")?.symbol;
    const symbol = selectedSymbol
      || extractTickerSymbol(evidenceSymbol)
      || extractTickerSymbol(contextStatus?.adminSymbolsPreview[0])
      || "GENERAL";
    return `refresh all missing evidence for ${symbol} before comparing the opportunity`;
  }

  async function runAgent(nextMessage: string) {
    const normalizedMessage = nextMessage.trim();
    if (!normalizedMessage) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, message: normalizedMessage, messages }),
      });
      if (!response.ok) {
        throw new Error(`Agent request failed: ${response.status}`);
      }
      const nextReply = (await response.json()) as AgentReply;
      setReply(nextReply);
      setMessages((current): ChatMessage[] => [
        ...current,
        { role: "user" as const, content: normalizedMessage },
        { role: "assistant" as const, content: nextReply.answer },
      ].slice(-8));
      await loadRunHistory();
    } catch (rawError) {
      setError(rawError instanceof Error ? rawError.message : String(rawError));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAgent(message);
  }

  async function runEvidenceRefresh() {
    const nextMessage = evidenceRefreshPrompt();
    setMessage(nextMessage);
    await runAgent(nextMessage);
  }

  function applyQuickAction(actionId: AgentQuickActionId) {
    setMessage(buildAgentPrompt(actionId, selectedSymbol, day));
    setPromptMeta({
      source: "Agent quick action",
      symbol: selectedSymbol ?? "当前机会",
      promptType: actionId,
      day,
    });
  }

  return (
    <aside className="agent-panel agent-panel-auxiliary" aria-label="机会观察 Agent">
      <div className="agent-header">
        <div>
          <p>研究上下文 Agent</p>
          <h2>机会观察助手</h2>
        </div>
        <span aria-live="polite">
          {reply
            ? `${reply.provider} / ${providerStatusLabel(reply.provider_status)}`
            : "就绪"}
        </span>
      </div>

      <form aria-busy={loading} aria-label="询问 Agent 表单" className="agent-form" onSubmit={submit}>
        <div className="agent-readonly-context">
          <span>研究日</span>
          <strong>{day || "解析中"}</strong>
        </div>
        <div className="agent-readonly-context">
          <span>当前机会</span>
          <strong>{selectedSymbol ?? "未选择"}</strong>
        </div>
        {promptMeta ? (
          <div className="agent-prompt-origin" aria-label="Prompt source">
            <span>Prompt source</span>
            <strong>{promptMeta.source}</strong>
            <small>{promptMeta.day} / {promptMeta.symbol} / {promptMeta.promptType}</small>
          </div>
        ) : null}
        <label htmlFor="agent-panel-message">
          问题
          <textarea
            id="agent-panel-message"
            name="agent-panel-message"
            ref={messageInputRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
          />
        </label>
        <div className="agent-quick-actions">
          {AGENT_QUICK_ACTIONS.map((action) => (
            <button
              disabled={loading}
              key={action.id}
              title={action.description}
              type="button"
              onClick={() => applyQuickAction(action.id)}
            >
              {action.label}
            </button>
          ))}
          <button
            aria-busy={loading}
            disabled={loading}
            type="button"
            onClick={runEvidenceRefresh}
          >
            刷新缺失证据
          </button>
        </div>
        <button
          aria-busy={loading}
          className="agent-submit-button"
          disabled={loading}
          type="submit"
        >
          {loading ? "分析中..." : "询问 Agent"}
        </button>
      </form>

      <details className="agent-auxiliary-section">
        <summary>上下文状态</summary>
        <AgentContextStatus
          loading={contextLoading}
          error={contextError}
          status={contextStatus}
        />
      </details>

      <details className="agent-auxiliary-section">
        <summary>运行记录</summary>
        <AgentRunHistory error={runError} history={runHistory} />
      </details>

      <AgentTimeline reply={reply} history={runHistory} />

      <details className="agent-auxiliary-section">
        <summary>工具状态</summary>
        <AgentToolPolicy error={toolError} tools={toolReadiness} />
      </details>

      <details className="agent-auxiliary-section">
        <summary>本地 CLI</summary>
        <LocalCliRunner />
      </details>

      {error ? (
        <p className="agent-error" role="alert">
          {error}
        </p>
      ) : null}

      {messages.length || reply ? (
        <details className="agent-auxiliary-section agent-deep-dive">
          <summary>
            Agent 深度详情
            <span>{reply ? reply.run_id : `${messages.length} 条上下文`}</span>
          </summary>

          {messages.length ? (
            <section aria-label="对话上下文" className="agent-history">
              <h3>对话上下文</h3>
              {messages.slice(-4).map((item, index) => (
                <p key={`${item.role}-${index}`}>
                  <strong>{item.role === "user" ? "你" : "Agent"}：</strong>
                  {item.content}
                </p>
              ))}
            </section>
          ) : null}

          {reply ? (
            <section aria-label="Agent 回答" className="agent-reply" aria-live="polite">
          <h3>回答</h3>
          <AgentAnswerBody answer={reply.answer} />
          <p className="agent-run-meta">
            运行 ID：<strong>{reply.run_id}</strong>
            <span>{formatBoundedPath(reply.evidence_log_path)}</span>
          </p>

          <AgentEvidenceDetail reply={reply} />

          <section className="agent-judgement-grid" aria-label="Agent 判断结构">
            <article>
              <h4>假设</h4>
              <p>{reply.hypothesis}</p>
            </article>
            <article>
              <h4>市场判断</h4>
              <ul>{reply.marketJudgement.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <h4>反证</h4>
              <ul>{reply.invalidation.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <h4>工具计划</h4>
              <ul>
                {reply.toolCalls.slice(0, 6).map((tool, index) => (
                  <li key={`${tool.name}-${index}`}>{tool.name}</li>
                ))}
              </ul>
              {reply.approvalRequired ? <strong>存在待确认工具</strong> : null}
            </article>
          </section>

          <h3>推理摘要</h3>
          <ul>
            {reply.reasoning_summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {reply.used_context.length ? (
            <>
              <h3>已用上下文</h3>
              <ul>
                {reply.used_context.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}

          {reply.opportunity_reasoning ? (
            <section className="agent-reasoning-context">
              <h3>推演上下文</h3>
              <p>{reply.opportunity_reasoning.adminTheory.summary}</p>

              {reply.opportunity_reasoning.candidateOpportunities.length ? (
                <>
                  <h4>候选观察</h4>
                  <ul>
                    {reply.opportunity_reasoning.candidateOpportunities.map((candidate) => (
                      <li key={candidate.symbol}>
                        <strong>{candidate.symbol}</strong>：{candidate.thesis}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.marketIntelNeeds.length ? (
                <>
                  <h4>市场情报需求</h4>
                  <ul>
                    {reply.opportunity_reasoning.marketIntelNeeds.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.researchPlan.length ? (
                <>
                  <h4>研究计划</h4>
                  <div className="agent-research-plan">
                    {reply.opportunity_reasoning.researchPlan.map((step) => {
                      const planStatus = researchPlanStepStatus(step, reply);
                      return (
                        <article key={step.stage}>
                          <div>
                            <strong>{step.title}</strong>
                            <span>{step.stage}</span>
                            <span className={`agent-plan-status agent-plan-status-${planStatus.status}`}>
                              {researchPlanStatusLabel(planStatus.status)}
                            </span>
                          </div>
                          <p>{step.question}</p>
                          <small>{step.method}</small>
                          <em>{step.expectedOutput}</em>
                          {planStatus.tools.length ? (
                            <code>{planStatus.tools.join(" / ")}</code>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : null}

              {reply.opportunity_reasoning.evidenceNeeds.length ? (
                <>
                  <h4>证据需求</h4>
                  <div className="agent-evidence-needs">
                    {reply.opportunity_reasoning.evidenceNeeds.slice(0, 8).map((need, index) => (
                      <article key={`${need.kind}-${need.symbol}-${index}`}>
                        <div>
                          <strong>{need.symbol}</strong>
                          <span>{need.kind}</span>
                          {need.required ? <em>必需</em> : null}
                        </div>
                        <p>{need.question}</p>
                        <small>{need.preferredTools.join(" / ")}</small>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {reply.opportunity_reasoning.invalidationPlan.length ? (
                <>
                  <h4>反证条件</h4>
                  <ul>
                    {reply.opportunity_reasoning.invalidationPlan.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {reply.opportunity_reasoning.nextChecks.length ? (
                <>
                  <h4>下一步检查</h4>
                  <ul>
                    {reply.opportunity_reasoning.nextChecks.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          <AgentToolTraceSection
            toolTrace={reply.tool_trace}
            policyDecisions={reply.policy_decisions}
          />

          <h3>下一步观察</h3>
          <ul>
            {reply.next_watch_plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <p className="agent-evidence-boundary">
            <strong>研究边界：</strong>
            以上回答仅用于研究观察与假设验证，不构成买卖指令。
          </p>
            </section>
          ) : null}
        </details>
      ) : null}
    </aside>
  );
}
