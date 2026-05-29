"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AgentToolPolicyDecision, AgentToolTrace, ReviewRecord } from "@stock-summary/summary-core";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EvidenceTimeline } from "./EvidenceTimeline";
import type { EvidenceActionView, InspectorView } from "./opportunity-view-model";

export type PendingEvidenceAction = {
  id: number;
  symbol: string;
  tool: string;
  label: string;
};

export type EvidenceToolActionRequest = {
  day: string;
  tool: string;
  symbol?: string;
  opportunityId?: string;
  query?: string;
  period?: string;
};

export type ExternalEvidenceResult = {
  policy?: AgentToolPolicyDecision;
  tool: AgentToolTrace;
};

type ActionResultView = ExternalEvidenceResult & {
  capturedAt: string;
};

type ReviewDraft = {
  outcome: ReviewRecord["outcome"];
  observedMove: string;
  failureReason: string;
  learning: string;
};

type WorkflowStepTone = "blocked" | "complete" | "current" | "pending";

type WorkflowStep = {
  id: string;
  label: string;
  value: string;
  summary: string;
  tone: WorkflowStepTone;
};

type WorkflowNextTarget = "evidence" | "review" | "invalidation";

type EvidenceQueueStats = {
  total: number;
  runnable: number;
  blocked: number;
  cached: number;
  required: number;
};

type ResearchInspectorProps = {
  day: string;
  view: InspectorView | null;
  pendingEvidenceAction?: PendingEvidenceAction | null;
  onRunEvidenceTool: (request: EvidenceToolActionRequest) => Promise<ExternalEvidenceResult>;
  onAgentPrompt?: (command: { text: string; source?: string; symbol?: string; promptType?: string; day?: string }) => void;
  onPendingEvidenceActionHandled?: (id: number) => void;
  onSessionRefresh?: () => Promise<void>;
  reviewCommandId?: number;
  reviewCommandReviewId?: string;
  reviewCommandSource?: "command-palette" | "review-ledger";
};

function actionVariant(state: string) {
  if (state === "blocked" || state === "error") return "destructive";
  if (state === "cached") return "secondary";
  return "outline";
}

function resultKey(result: ExternalEvidenceResult, index: number) {
  return `${result.tool.name}-${result.tool.execution_status ?? "executed"}-${index}`;
}

function resultStatus(result: ExternalEvidenceResult) {
  return result.policy?.status ?? result.tool.execution_status ?? "executed";
}

function resultLabel(status: string) {
  if (status === "blocked" || status === "rejected") return "被阻断";
  if (status === "failed") return "失败";
  if (status === "pending_approval") return "待确认";
  if (status === "allowed" || status === "approved" || status === "executed") return "已记录";
  return status;
}

function resultNextStep(status: string) {
  if (status === "blocked" || status === "rejected") return "复核工具配置或改走人工复核";
  if (status === "failed") return "查看错误摘要后重试";
  if (status === "pending_approval") return "在本地 CLI 确认卡中处理";
  return "回到最近 evidence runs 复核证据影响";
}

function resultTone(status: string) {
  if (status === "blocked" || status === "rejected") return "blocked";
  if (status === "failed") return "failed";
  if (status === "pending_approval") return "pending_approval";
  return "allowed";
}

function buildWorkflowSteps(view: InspectorView): WorkflowStep[] {
  const evidenceGapCount = view.evidenceGaps.length;
  const evidenceRunCount = view.recentEvidenceRuns.length;
  const reviewCount = view.reviewRecords.length;
  const blockedRunCount = view.recentEvidenceRuns.filter((run) => run.verdict === "blocked").length;
  const latestReview = view.reviewRecords[0];

  return [
    {
      id: "evidence-gaps",
      label: "证据缺口",
      value: String(evidenceGapCount),
      summary: evidenceGapCount ? "先补关键证据" : "暂无明确缺口",
      tone: evidenceGapCount ? "current" : "complete",
    },
    {
      id: "evidence-runs",
      label: "Evidence run",
      value: String(evidenceRunCount),
      summary: evidenceRunCount
        ? `${blockedRunCount} blocked / ${evidenceRunCount} total`
        : "尚未运行证据",
      tone: evidenceRunCount
        ? blockedRunCount === evidenceRunCount
          ? "blocked"
          : "complete"
        : "pending",
    },
    {
      id: "review-state",
      label: "复盘状态",
      value: String(reviewCount),
      summary: latestReview ? REVIEW_OUTCOME_LABELS[latestReview.outcome] : "未复盘",
      tone: reviewCount ? "complete" : evidenceRunCount ? "current" : "pending",
    },
  ];
}

function workflowNextAction(view: InspectorView) {
  if (!view.recentEvidenceRuns.length && view.evidenceGaps.length) {
    return "先运行可用证据动作，补齐关键缺口。";
  }
  if (view.recentEvidenceRuns.length && !view.reviewRecords.length) {
    return "记录复盘：把证据影响、反证条件和学习写入本地记录。";
  }
  if (view.reviewRecords.length) {
    return "复查最新复盘，决定是否继续观察或补充新证据。";
  }
  return "检查假设与失效条件，决定下一条证据需求。";
}

function workflowNextTarget(view: InspectorView): WorkflowNextTarget {
  if (!view.recentEvidenceRuns.length && view.evidenceGaps.length) {
    return "evidence";
  }
  if (view.recentEvidenceRuns.length || view.reviewRecords.length) {
    return "review";
  }
  return "invalidation";
}

function workflowNextButtonLabel(target: WorkflowNextTarget) {
  if (target === "evidence") return "定位证据动作";
  if (target === "review") return "打开复盘入口";
  return "查看失效条件";
}

function buildEvidenceQueueStats(actions: EvidenceActionView[]): EvidenceQueueStats {
  return actions.reduce(
    (stats, action) => ({
      total: stats.total + 1,
      runnable: stats.runnable + (action.executable ? 1 : 0),
      blocked: stats.blocked + (action.state === "blocked" ? 1 : 0),
      cached: stats.cached + (action.state === "cached" ? 1 : 0),
      required: stats.required + (action.required ? 1 : 0),
    }),
    { total: 0, runnable: 0, blocked: 0, cached: 0, required: 0 },
  );
}

function actionPriority(action: EvidenceActionView) {
  if (action.required && action.executable && action.state !== "cached") return 0;
  if (action.executable && action.state !== "cached") return 1;
  if (action.required) return 2;
  if (action.state === "cached") return 3;
  if (action.state === "blocked") return 4;
  return 5;
}

function orderedEvidenceActions(actions: EvidenceActionView[]) {
  return actions.slice().sort((left, right) => {
    const priorityDelta = actionPriority(left) - actionPriority(right);
    if (priorityDelta) return priorityDelta;
    return left.label.localeCompare(right.label);
  });
}

function primaryEvidenceAction(actions: EvidenceActionView[]) {
  return actions.find((action) => action.executable && action.state !== "cached")
    ?? actions.find((action) => action.executable)
    ?? null;
}

function buildWorkflowAgentPrompt({
  day,
  symbol,
  workflowTarget,
  nextAction,
  evidenceGaps,
  invalidation,
}: {
  day: string;
  symbol: string;
  workflowTarget: WorkflowNextTarget;
  nextAction: string;
  evidenceGaps: string[];
  invalidation: string[];
}) {
  const gapText = evidenceGaps.slice(0, 3).join("；") || "暂无明确证据缺口";
  const invalidationText = invalidation.slice(0, 3).join("；") || "暂无明确失效条件";
  if (workflowTarget === "evidence") {
    return `基于 ${day} 的研究上下文，为 ${symbol} 制定补证计划：下一步是“${nextAction}”。优先处理这些证据缺口：${gapText}。只输出研究判断、工具顺序和反证条件。`;
  }
  if (workflowTarget === "review") {
    return `基于 ${day} 的研究上下文，复核 ${symbol} 的最新 evidence run 和复盘入口：下一步是“${nextAction}”。请给出证据影响、还缺什么、以及是否需要继续观察。`;
  }
  return `基于 ${day} 的研究上下文，优先反证 ${symbol}：下一步是“${nextAction}”。请围绕这些失效条件展开：${invalidationText}。`;
}

function buildReviewDraftFromAction({
  action,
  actionResult,
  actionResultLabel,
  actionResultNextStep,
  symbol,
}: {
  action: EvidenceActionView;
  actionResult: ActionResultView;
  actionResultLabel: string;
  actionResultNextStep: string;
  symbol: string;
}): ReviewDraft {
  const status = resultStatus(actionResult);
  const summary = actionResult.tool.result_summary.trim();
  const failureReason = status === "blocked" || status === "rejected" || status === "failed"
    ? `${actionResultLabel}：${summary}`
    : "";

  return {
    outcome: "unclear",
    observedMove: `${action.label} 返回${actionResultLabel}：${summary}`,
    failureReason,
    learning: `${symbol} / ${action.kind}：围绕“${action.question}”更新证据。下一步：${actionResultNextStep}`,
  };
}

function matchesPendingAction(action: EvidenceActionView, pendingAction: PendingEvidenceAction) {
  const requestedTool = pendingAction.tool.toLowerCase();
  const requestedLabel = pendingAction.label.toLowerCase();
  return action.tool.toLowerCase() === requestedTool
    || action.kind.toLowerCase() === requestedTool
    || action.label.toLowerCase().includes(requestedTool)
    || action.label.toLowerCase().includes(requestedLabel.replace(/^补\s+/u, ""));
}

const REVIEW_OUTCOME_LABELS: Record<ReviewRecord["outcome"], string> = {
  failed: "已失效",
  unclear: "未确认",
  validated: "已验证",
};

function ReviewRecordList({ records }: { records: ReviewRecord[] }) {
  if (!records.length) {
    return <p className="inspector-muted">还没有复盘记录。</p>;
  }

  return (
    <div className="inspector-review-list inspector-review-timeline" aria-label="复盘时间线">
      {records.map((record) => (
        <article className="inspector-review-event" data-outcome={record.outcome} key={record.id}>
          <div className="inspector-review-meta">
            <Badge variant={record.outcome === "failed" ? "destructive" : record.outcome === "validated" ? "success" : "secondary"}>
              {REVIEW_OUTCOME_LABELS[record.outcome]}
            </Badge>
            <time dateTime={record.createdAt}>{record.createdAt}</time>
          </div>
          <p>{record.observedMove}</p>
          {record.failureReason ? <small>{record.failureReason}</small> : null}
          <small><strong>学习</strong>{record.learning}</small>
        </article>
      ))}
    </div>
  );
}

export function ResearchInspector({
  day,
  view,
  pendingEvidenceAction,
  onRunEvidenceTool,
  onAgentPrompt,
  onPendingEvidenceActionHandled,
  onSessionRefresh,
  reviewCommandId,
  reviewCommandReviewId,
  reviewCommandSource,
}: ResearchInspectorProps) {
  const [runningActionId, setRunningActionId] = useState("");
  const [commandTargetActionId, setCommandTargetActionId] = useState("");
  const [pendingActionStatus, setPendingActionStatus] = useState("");
  const [actionResults, setActionResults] = useState<ActionResultView[]>([]);
  const [actionResultById, setActionResultById] = useState<Record<string, ActionResultView>>({});
  const [actionError, setActionError] = useState("");
  const [outcome, setOutcome] = useState<ReviewRecord["outcome"]>("unclear");
  const [observedMove, setObservedMove] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [learning, setLearning] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSaveStatus, setReviewSaveStatus] = useState("");
  const [reviewDraftStatus, setReviewDraftStatus] = useState("");
  const [workflowAgentStatus, setWorkflowAgentStatus] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const actionButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const evidenceActionSectionRef = useRef<HTMLElement | null>(null);
  const invalidationSectionRef = useRef<HTMLElement | null>(null);
  const reviewFormRef = useRef<HTMLFormElement | null>(null);

  const reviewFocusKey = useMemo(() => reviewCommandId ?? 0, [reviewCommandId]);

  useEffect(() => {
    if (!reviewFocusKey) return;
    reviewFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    reviewFormRef.current?.querySelector<HTMLTextAreaElement | HTMLSelectElement>("textarea, select")?.focus();
  }, [reviewFocusKey]);

  useEffect(() => {
    if (!pendingEvidenceAction || !view) return;
    if (view.row.symbol.toUpperCase() !== pendingEvidenceAction.symbol.toUpperCase()) return;

    const action = view.evidenceActions.find((item) => matchesPendingAction(item, pendingEvidenceAction));
    if (!action) {
      setPendingActionStatus(`来自命令面板：未找到 ${view.row.symbol} / ${pendingEvidenceAction.label} 证据动作。`);
      onPendingEvidenceActionHandled?.(pendingEvidenceAction.id);
      return;
    }

    setCommandTargetActionId(action.id);
    setPendingActionStatus(
      action.executable
        ? `来自命令面板：已定位 ${view.row.symbol} / ${action.label}，按 Enter 或点击运行。`
        : `来自命令面板：${action.label} 不可运行：${action.stateReason}`,
    );
    window.requestAnimationFrame(() => {
      actionButtonRefs.current[action.id]?.scrollIntoView({ block: "center", behavior: "smooth" });
      actionButtonRefs.current[action.id]?.focus();
      onPendingEvidenceActionHandled?.(pendingEvidenceAction.id);
    });
  }, [onPendingEvidenceActionHandled, pendingEvidenceAction, view]);

  if (!view) {
    return (
      <aside className="research-inspector-pro research-inspector-empty" aria-label="研究对象面板">
        <p>请先选择一个机会，查看判断、证据缺口、外部证据动作与复盘入口。</p>
        <p className="opportunity-detail-boundary">仅供研究观察，不是交易指令。</p>
      </aside>
    );
  }

  const activeView = view;
  const workflowSteps = buildWorkflowSteps(activeView);
  const nextWorkflowAction = workflowNextAction(activeView);
  const workflowTarget = workflowNextTarget(activeView);
  const workflowButtonLabel = workflowNextButtonLabel(workflowTarget);
  const evidenceQueueStats = buildEvidenceQueueStats(activeView.evidenceActions);
  const orderedActions = orderedEvidenceActions(activeView.evidenceActions);
  const primaryAction = primaryEvidenceAction(orderedActions);
  const reviewHandoffDetail = reviewCommandSource === "review-ledger"
    ? `来自复盘账本：已回到 ${activeView.row.symbol} 的复盘区，复核最新记录后决定是否继续补证据。${reviewCommandReviewId ? ` 记录 ${reviewCommandReviewId}` : ""}`
    : `来自命令面板：已打开 ${activeView.row.symbol} 的复盘入口，请填写 outcome、观察到的变化和学习记录。`;
  const commandHandoff = pendingActionStatus
    ? {
      detail: pendingActionStatus,
      target: "evidence" as const,
      title: `${activeView.row.symbol} / Evidence action`,
      tone: "evidence" as const,
    }
    : reviewFocusKey
      ? {
        detail: reviewHandoffDetail,
        target: "review" as const,
        title: reviewCommandSource === "review-ledger"
          ? `${activeView.row.symbol} / 复盘记录`
          : `${activeView.row.symbol} / 复盘入口`,
        tone: "review" as const,
      }
      : null;
  const latestReviewSyncStatus = view.reviewRecords[0]
    ? `最新复盘已同步到机会行和复盘列表：${REVIEW_OUTCOME_LABELS[view.reviewRecords[0].outcome]} / ${view.reviewRecords[0].createdAt}`
    : "";

  async function runAction(action: EvidenceActionView) {
    if (!action.executable || !action.request) {
      setActionError(action.stateReason);
      return;
    }

    setRunningActionId(action.id);
    setActionError("");
    try {
      const result = await onRunEvidenceTool({ day, ...action.request });
      const actionResult = { ...result, capturedAt: new Date().toISOString() };
      setActionResults((current) => [actionResult, ...current].slice(0, 5));
      setActionResultById((current) => ({ ...current, [action.id]: { ...result, capturedAt: actionResult.capturedAt } }));
      setPendingActionStatus(`已完成 ${action.label}: ${resultStatus(actionResult)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningActionId("");
    }
  }

  function prefillReviewFromAction(
    action: EvidenceActionView,
    actionResult: ActionResultView,
    actionResultNextStep: string,
  ) {
    const draft = buildReviewDraftFromAction({
      action,
      actionResult,
      actionResultLabel: resultLabel(resultStatus(actionResult)),
      actionResultNextStep,
      symbol: activeView.row.symbol,
    });
    setObservedMove(draft.observedMove);
    setFailureReason(draft.failureReason);
    setLearning(draft.learning);
    setOutcome(draft.outcome);
    setReviewError("");
    setReviewDraftStatus("本次证据已带入复盘草稿，请复核 outcome 后保存。");
    window.requestAnimationFrame(() => {
      reviewFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      reviewFormRef.current?.querySelector<HTMLTextAreaElement | HTMLSelectElement>("textarea, select")?.focus();
    });
  }

  function focusFirstExecutableEvidenceAction() {
    const firstExecutableAction = primaryAction;
    if (!firstExecutableAction) {
      setPendingActionStatus("当前没有可运行证据动作，请查看 blocked/cached 状态原因。");
      evidenceActionSectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setCommandTargetActionId(firstExecutableAction.id);
    setPendingActionStatus(`已定位 ${activeView.row.symbol} / ${firstExecutableAction.label}，按 Enter 或点击运行。`);
    window.requestAnimationFrame(() => {
      actionButtonRefs.current[firstExecutableAction.id]?.scrollIntoView({ block: "center", behavior: "smooth" });
      actionButtonRefs.current[firstExecutableAction.id]?.focus();
    });
  }

  function handleWorkflowNextAction() {
    if (workflowTarget === "evidence") {
      focusFirstExecutableEvidenceAction();
      return;
    }

    if (workflowTarget === "review") {
      reviewFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      reviewFormRef.current?.querySelector<HTMLTextAreaElement | HTMLSelectElement>("textarea, select")?.focus();
      return;
    }

    invalidationSectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function focusCommandHandoffTarget() {
    if (commandHandoff?.target === "review") {
      reviewFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      reviewFormRef.current?.querySelector<HTMLTextAreaElement | HTMLSelectElement>("textarea, select")?.focus();
      return;
    }

    if (commandTargetActionId) {
      actionButtonRefs.current[commandTargetActionId]?.scrollIntoView({ block: "center", behavior: "smooth" });
      actionButtonRefs.current[commandTargetActionId]?.focus();
      return;
    }

    evidenceActionSectionRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function sendWorkflowPromptToAgent() {
    onAgentPrompt?.({
      text: buildWorkflowAgentPrompt({
        day,
        symbol: activeView.row.symbol,
        workflowTarget,
        nextAction: nextWorkflowAction,
        evidenceGaps: activeView.evidenceGaps.map((need) => need.question),
        invalidation: activeView.invalidation,
      }),
      source: "Inspector",
      symbol: activeView.row.symbol,
      promptType: workflowTarget,
      day,
    });
    setWorkflowAgentStatus("已写入右侧 Agent 输入框，请复核后运行。");
  }

  function renderEvidenceQueueSection() {
    return (
      <section
        className="inspector-section inspector-evidence-queue"
        aria-label="Evidence Queue"
        aria-live="polite"
        ref={evidenceActionSectionRef}
      >
        <div className="inspector-evidence-queue-head">
          <div>
            <h4>Evidence Queue</h4>
            <p className="inspector-muted">按必需、可运行、缓存和 blocked 状态排序；刷新后会更新最近 evidence runs 和机会状态。</p>
          </div>
          <div className="inspector-evidence-queue-stats" aria-label="证据动作状态统计">
            <article data-queue-state="ready">
              <span>可运行</span>
              <strong>{evidenceQueueStats.runnable}</strong>
            </article>
            <article data-queue-state="required">
              <span>必需</span>
              <strong>{evidenceQueueStats.required}</strong>
            </article>
            <article data-queue-state="blocked">
              <span>blocked</span>
              <strong>{evidenceQueueStats.blocked}</strong>
            </article>
            <article data-queue-state="cached">
              <span>cached</span>
              <strong>{evidenceQueueStats.cached}</strong>
            </article>
          </div>
        </div>
        {primaryAction ? (
          <div className="inspector-evidence-primary">
            <span>Primary evidence action</span>
            <strong>{primaryAction.groupLabel} / {primaryAction.label}</strong>
            <p>{primaryAction.question}</p>
            <Button
              className="inspector-evidence-focus-button"
              onClick={focusFirstExecutableEvidenceAction}
              type="button"
              variant="outline"
            >
              定位首个可运行
            </Button>
          </div>
        ) : (
          <div className="inspector-evidence-primary" data-empty="true">
            <span>Primary evidence action</span>
            <strong>暂无可运行工具</strong>
            <p>请查看 blocked 原因，或改走人工复核。</p>
          </div>
        )}
        <div aria-live="polite">
          {pendingActionStatus ? <p className="inspector-command-status">{pendingActionStatus}</p> : null}
        </div>
        {actionError ? <p className="agent-error" role="alert">{actionError}</p> : null}
        {orderedActions.length ? (
          <div className="inspector-action-grid">
            {orderedActions.map((action) => {
              const pending = runningActionId === action.id;
              const fromCommand = commandTargetActionId === action.id;
              const stateLabel = pending ? "pending" : action.stateLabel;
              const actionResult = actionResultById[action.id];
              const actionResultStatus = actionResult ? resultStatus(actionResult) : "";
              const actionResultLabel = resultLabel(actionResultStatus);
              const actionResultNextStep = resultNextStep(actionResultStatus);
              return (
                <article
                  className={[
                    "inspector-action-card",
                    `inspector-action-card-${pending ? "pending" : action.state}`,
                    fromCommand ? "inspector-action-card-command" : "",
                  ].filter(Boolean).join(" ")}
                  data-command-target={fromCommand ? "true" : undefined}
                  key={action.id}
                >
                  <div className="inspector-action-head">
                    <div>
                      <span>{action.groupLabel}</span>
                      <strong>{action.label}</strong>
                    </div>
                    <Badge className="inspector-action-state" variant={actionVariant(pending ? "pending" : action.state)}>
                      {stateLabel}
                    </Badge>
                  </div>
                  <p className="inspector-action-question">{action.question}</p>
                  <p className="inspector-action-reason">{action.stateReason}</p>
                  <div className="inspector-action-last-run">
                    <span>上次证据</span>
                    <strong>{action.lastRunLabel}</strong>
                    {action.lastRunSummary ? <p>{action.lastRunSummary}</p> : <p>无运行记录</p>}
                    {action.lastRunAt ? <small>{action.lastRunAt}</small> : null}
                  </div>
                  {actionResult ? (
                    <div className={`inspector-action-result inspector-action-result-${resultTone(actionResultStatus)}`}>
                      <div className="inspector-action-result-head">
                        <span>本次结果</span>
                        <strong>{actionResult.tool.name}</strong>
                      </div>
                      <div className="inspector-action-result-grid">
                        <div>
                          <span>状态</span>
                          <strong>{actionResultLabel}</strong>
                        </div>
                        <div>
                          <span>时间</span>
                          <strong>{actionResult.capturedAt}</strong>
                        </div>
                        <div className="inspector-action-result-summary">
                          <span>原因</span>
                          <p>{actionResult.tool.result_summary}</p>
                        </div>
                        <div className="inspector-action-result-summary">
                          <span>下一步</span>
                          <p>{actionResultNextStep}</p>
                        </div>
                      </div>
                      <div className="inspector-review-bridge">
                        <span>复盘草稿</span>
                        <p>把本次证据结果带入复盘入口，保留人工判断 outcome。</p>
                        <Button
                          className="inspector-review-bridge-button"
                          onClick={() => prefillReviewFromAction(action, actionResult, actionResultNextStep)}
                          type="button"
                          variant="outline"
                        >
                          带入复盘
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="inspector-action-foot">
                    <small>
                      {action.required ? "必需证据" : "补充证据"} / {action.kind} / {action.lastRunVerdictLabel}
                    </small>
                    <Button
                      aria-busy={pending}
                      className="inspector-action-button"
                      disabled={pending || !action.executable}
                      onClick={() => void runAction(action)}
                      ref={(element) => {
                        actionButtonRefs.current[action.id] = element;
                      }}
                      type="button"
                      variant={actionVariant(pending ? "pending" : action.state)}
                    >
                      {pending ? "运行中" : action.executable ? "运行" : "不可运行"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="inspector-muted">没有可绑定的外部证据工具。</p>
        )}
        {actionResults.length ? (
          <div className="inspector-action-results">
            {actionResults.map((result, index) => (
              <article key={resultKey(result, index)}>
                <strong>{result.tool.name}</strong>
                <span>{resultStatus(result)}</span>
                <p>{result.tool.result_summary}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeView.row.opportunity?.id) {
      setReviewError("当前机会缺少 session opportunity id，无法保存复盘。");
      return;
    }
    if (!observedMove.trim() || !learning.trim()) {
      setReviewError("请填写观察到的变化和学习记录。");
      return;
    }

    setSavingReview(true);
    setReviewError("");
    setReviewSaveStatus("");
    try {
      const response = await fetch("/api/research/review-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          opportunityId: activeView.row.opportunity.id,
          outcome,
          observedMove: observedMove.trim(),
          failureReason: failureReason.trim(),
          learning: learning.trim(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Review record request failed: ${response.status}`);
      }
      setObservedMove("");
      setFailureReason("");
      setLearning("");
      setReviewDraftStatus("");
      setReviewSaveStatus("复盘已保存，正在刷新机会行和复盘列表。");
      await onSessionRefresh?.();
      setReviewSaveStatus("复盘已保存，机会行和复盘列表已刷新。");
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <aside className="research-inspector-pro" aria-label={`${view.row.symbol} 研究对象面板`}>
      <div className="research-inspector-head">
        <div>
          <p className="eyebrow">Research Inspector</p>
          <h3>
            #{view.row.rank.toString().padStart(2, "0")} {view.row.symbol}
          </h3>
        </div>
        <div className="research-inspector-status">
          <Badge variant={view.row.evidenceGapCount ? "warning" : "success"}>
            {view.row.statusLabel}
          </Badge>
          <span className="score-pill">{view.row.score}</span>
        </div>
      </div>

      {commandHandoff ? (
        <div className="inspector-command-handoff" data-handoff={commandHandoff.tone} aria-live="polite">
          <div>
            <span>Command handoff</span>
            <strong>{commandHandoff.title}</strong>
            <p>{commandHandoff.detail}</p>
          </div>
          <Button
            className="inspector-command-handoff-button"
            onClick={focusCommandHandoffTarget}
            type="button"
            variant="outline"
          >
            查看目标
          </Button>
        </div>
      ) : null}

      <div className="inspector-workflow-strip" aria-label="机会研究流程">
        {workflowSteps.map((step) => (
          <article className="inspector-workflow-step" data-workflow-state={step.tone} key={step.id}>
            <span>{step.label}</span>
            <strong>{step.value}</strong>
            <small>{step.summary}</small>
          </article>
        ))}
        <article className="inspector-workflow-next">
          <span>关键下一步</span>
          <strong>{nextWorkflowAction}</strong>
          <Button
            aria-label={`执行关键下一步：${nextWorkflowAction}`}
            className="inspector-workflow-next-button"
            onClick={handleWorkflowNextAction}
            type="button"
            variant="outline"
          >
            {workflowButtonLabel}
          </Button>
          <Button
            className="inspector-workflow-agent-button"
            disabled={!onAgentPrompt}
            onClick={sendWorkflowPromptToAgent}
            type="button"
            variant="secondary"
          >
            问 Agent 反证
          </Button>
          {workflowAgentStatus ? <small className="inspector-workflow-agent-status">{workflowAgentStatus}</small> : null}
        </article>
      </div>

      {renderEvidenceQueueSection()}

      <section className="inspector-section">
        <h4>判断摘要</h4>
        <p>{view.judgementSummary}</p>
      </section>

      <section className="inspector-section">
        <h4>假设</h4>
        <p>{view.hypothesis}</p>
      </section>

      <section className="inspector-section">
        <h4>支持证据</h4>
        {view.supportingEvidence.length ? (
          <ul>
            {view.supportingEvidence.map((item, index) => <li key={`supporting-${index}`}>{item}</li>)}
          </ul>
        ) : (
          <p className="inspector-muted">尚无 supporting evidence，需要先补外部证据。</p>
        )}
      </section>

      <section className="inspector-section">
        <h4>证据缺口</h4>
        {view.evidenceGaps.length ? (
          <ul className="inspector-evidence-gaps">
            {view.evidenceGaps.map((need, index) => (
              <li key={`evidence-gap-${need.kind}-${index}`}>
                <strong>{need.kind}</strong>
                <span>{need.question}</span>
                {need.required ? <Badge variant="warning">必需</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="inspector-muted">当前机会没有明确证据缺口。</p>
        )}
      </section>

      <section className="inspector-section" ref={invalidationSectionRef}>
        <h4>失效条件</h4>
        {view.invalidation.length ? (
          <ul>
            {view.invalidation.map((item, index) => <li key={`invalidation-${index}`}>{item}</li>)}
          </ul>
        ) : (
          <p className="inspector-muted">未记录明确失效条件。</p>
        )}
      </section>

      <section className="inspector-section">
        <h4>最近 evidence runs</h4>
        <EvidenceTimeline runs={view.recentEvidenceRuns} />
      </section>

      <section className="inspector-section inspector-review-section" data-review-focus-key={reviewFocusKey}>
        <h4>复盘入口</h4>
        <form className="review-form review-form-compact" ref={reviewFormRef} onSubmit={submitReview}>
          <label>
            复盘结果
            <select value={outcome} onChange={(event) => setOutcome(event.target.value as ReviewRecord["outcome"])}>
              <option value="unclear">未确认</option>
              <option value="validated">已验证</option>
              <option value="failed">已失效</option>
            </select>
          </label>
          <label>
            观察到的变化
            <textarea value={observedMove} onChange={(event) => setObservedMove(event.target.value)} rows={2} />
          </label>
          <label>
            失效原因
            <textarea value={failureReason} onChange={(event) => setFailureReason(event.target.value)} rows={2} />
          </label>
          <label>
            学习记录
            <textarea value={learning} onChange={(event) => setLearning(event.target.value)} rows={2} />
          </label>
          {reviewError ? <p className="agent-error" role="alert">{reviewError}</p> : null}
          {reviewDraftStatus ? <p className="inspector-review-draft-status">{reviewDraftStatus}</p> : null}
          <div aria-live="polite">
            {reviewSaveStatus ? <p className="inspector-success">{reviewSaveStatus}</p> : null}
          </div>
          {latestReviewSyncStatus ? <p className="inspector-review-sync-status">{latestReviewSyncStatus}</p> : null}
          <Button disabled={savingReview || !observedMove.trim() || !learning.trim()} type="submit">
            {savingReview ? "保存中" : "保存复盘"}
          </Button>
        </form>
        <ReviewRecordList records={view.reviewRecords} />
      </section>

      <p className="opportunity-detail-boundary">仅供研究观察，不是交易指令。</p>
    </aside>
  );
}
