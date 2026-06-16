/**
 * ChatReAct — Chat Agent 的 ReAct 封装
 *
 * 基于 Vercel AI SDK v4 原生能力:
 *   - maxRetries          — SDK 内建工具调用重试（默认 2）
 *   - abortSignal         — 用户取消正在运行的 Agent
 *   - experimental_repairToolCall — SDK 自动修复非法工具调用
 *   - experimental_activeTools    — 限定本次可用工具集合
 *   - onStepFinish         — Thought/Action/Observation 可见性
 *   - abortSignal          — 空转检测 + token 超限 → 终止循环
 *
 * 我们只保留领域护栏: 空转检测、token 超限、步骤限制。
 * 其余全委托给 SDK。
 *
 * 设计依据:
 *   - 14_llm_reasoning_strategy.md §3.5 确定性护栏
 *   - 14_llm_reasoning_strategy.md §7 成本分层
 *   - Vercel AI SDK v4.3.19 index.d.mts L2471 (generateText 声明)
 */

import { generateText, type CoreTool, type LanguageModel, type ToolCall, type ToolResult } from "ai";
import { extractWorkflowRunsFromGenerateText, type WorkflowRun } from "./chatWorkflowRuns.js";
import type { ChatMessage } from "../tui/types.js";
import { logger } from "../log/logger.js";

// ─── 类型 ─────────────────────────────────────────────────

export type StepTrace = {
  step: number;
  thought: string;
  actions: string[];
  observations: string;
  tokensUsed: number;
  elapsedMs: number;
};

export type ReActResult = {
  text: string;
  steps: StepTrace[];
  workflowRuns: WorkflowRun[];
  totalTokens: number;
  totalMs: number;
  wallClockMs: number;
  terminatedBy: "natural" | "max_steps" | "empty_loop" | "aborted" | "error";
};

export type TurnCompleteInfo = {
  finalText: string;
  terminatedBy: ReActResult["terminatedBy"];
  totalTokens: number;
  totalMs: number;
  wallClockMs: number;
  steps: StepTrace[];
  workflowRuns: WorkflowRun[];
};

export type ReActOptions = {
  model: LanguageModel;
  system: string;
  messages: ChatMessage[];
  tools: Record<string, CoreTool>;
  /** 最大步骤数，默认 10 */
  maxSteps?: number;
  /** 最大连续空转步数（无 tool + 无实质输出），默认 2 */
  maxEmptySteps?: number;
  /** 总 token 上限，默认 50K */
  maxTokens?: number;
  /** 外部 AbortSignal — 用户按 Escape 可中止 Agent */
  abortSignal?: AbortSignal;
  /** SDK 工具调用重试次数，默认 2 */
  maxRetries?: number;
  /** 每步回调，用于 UI 更新 */
  onStep?: (trace: StepTrace) => void;
  /** 循环结束回调，携带最终结果与统计 */
  onTurnComplete?: (info: TurnCompleteInfo) => void;
  /** 限定本次可用的工具子集。 */
  activeTools?: string[];
};

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_MAX_EMPTY_STEPS = 2;
const DEFAULT_MAX_TOKENS = 50_000;
const DEFAULT_MAX_RETRIES = 2;

// ─── 护栏 ─────────────────────────────────────────────────

function isSubstantive(text: string): boolean {
  return text.replace(/\s/g, "").length > 20;
}

function summarizeActions(toolCalls: ToolCall<string, unknown>[]): string[] {
  return toolCalls.map((tc) => {
    const args = JSON.stringify(tc.args);
    return `${tc.toolName}(${args.slice(0, 80)}${args.length > 80 ? "…" : ""})`;
  });
}

function summarizeObservations(toolResults: ToolResult<string, unknown, unknown>[]): string {
  return toolResults
    .map((tr) => {
      const r = tr.result;
      if (typeof r === "string") return r.slice(0, 120);
      if (r && typeof r === "object") {
        const keys = Object.keys(r).slice(0, 5);
        return `{ ${keys.join(", ")} }`;
      }
      return String(r).slice(0, 120);
    })
    .join(" | ");
}

export function toTurnCompleteInfo(result: ReActResult): TurnCompleteInfo {
  return {
    finalText: result.text,
    terminatedBy: result.terminatedBy,
    totalTokens: result.totalTokens,
    totalMs: result.totalMs,
    wallClockMs: result.wallClockMs,
    steps: result.steps,
    workflowRuns: result.workflowRuns,
  };
}

// ─── 主函数 ───────────────────────────────────────────────

export async function chatReAct(opts: ReActOptions): Promise<ReActResult> {
  const {
    model,
    system,
    messages,
    tools,
    maxSteps = DEFAULT_MAX_STEPS,
    maxEmptySteps = DEFAULT_MAX_EMPTY_STEPS,
    maxTokens = DEFAULT_MAX_TOKENS,
    abortSignal,
    maxRetries = DEFAULT_MAX_RETRIES,
    onStep,
    onTurnComplete,
    activeTools,
  } = opts;

  const stepTraces: StepTrace[] = [];
  let totalTokens = 0;
  let emptyStepCount = 0;
  const wallStart = Date.now();
  let terminatedBy: ReActResult["terminatedBy"] = "natural";
  let finalText = "";
  let workflowRuns: WorkflowRun[] = [];
  const runController = new AbortController();
  const abortRun = () => runController.abort();

  // 步骤计时
  const stepStartTimes: number[] = [Date.now()];

  try {
    if (abortSignal?.aborted) {
      runController.abort();
    } else {
      abortSignal?.addEventListener("abort", abortRun, { once: true });
    }

    const result = await generateText({
      model,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools,
      maxSteps,
      maxRetries,
      abortSignal: runController.signal,
      toolChoice: "auto",

      // SDK 自动修复工具调用（拼写错误、缺参数等）
      experimental_repairToolCall: async ({ toolCall, error }) => {
        // 简单修复: 如果是拼写错误，尝试匹配最近似的工具名
        logger.info(
          { toolName: toolCall.toolName, err: error.message },
          "tool call repair",
        );
        return null; // 返回 null 表示不修复，让其失败（后续可用 LLM 辅助修复）
      },

      // 每步动态选择工具
      ...(activeTools && activeTools.length > 0 ? {
        experimental_activeTools: activeTools,
      } : {}),

      // 核心回调: Thought / Action / Observation 可见性 + 护栏
      onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
        const elapsed = stepStartTimes.length > 0
          ? Date.now() - stepStartTimes[stepStartTimes.length - 1]
          : 0;
        stepStartTimes.push(Date.now());

        const stepTokens = (usage?.totalTokens ?? 0) - totalTokens;
        totalTokens = usage?.totalTokens ?? totalTokens;

        // 缓存命中率埋点（运行时字段，不在 SDK 类型定义中）
        const usageExt = usage as Record<string, number> | undefined;
        const cacheHit = usageExt?.promptCacheHitTokens ?? 0;
        const cacheMiss = usageExt?.promptCacheMissTokens ?? 0;
        if (cacheHit + cacheMiss > 0) {
          logger.info(
            { cacheHit, cacheMiss, hitRate: cacheHit / (cacheHit + cacheMiss) },
            "prompt cache stats",
          );
        }

        const actions = summarizeActions(toolCalls ?? []);
        const observations = summarizeObservations(toolResults ?? []);

        const trace: StepTrace = {
          step: stepTraces.length + 1,
          thought: text.slice(0, 300),
          actions,
          observations,
          tokensUsed: Math.max(0, stepTokens),
          elapsedMs: elapsed,
        };

        stepTraces.push(trace);

        // ─── 确定性护栏 ─────────────────────────────────

        // 空转检测
        if (actions.length === 0 && !isSubstantive(text)) {
          emptyStepCount++;
          if (emptyStepCount >= maxEmptySteps) {
            terminatedBy = "empty_loop";
            trace.observations += " [护栏: 连续空转，终止]";
            runController.abort();
          }
        } else {
          emptyStepCount = 0;
        }

        // Token 超限
        if (totalTokens > maxTokens) {
          terminatedBy = "max_steps";
          trace.observations += ` [护栏: token 超限 ${totalTokens}/${maxTokens}]`;
          runController.abort();
        }

        // 步骤超限
        if (trace.step >= maxSteps) {
          terminatedBy = "max_steps";
          trace.observations += ` [护栏: 达到最大步数 ${maxSteps}]`;
        }

        if (onStep) onStep(trace);
      },
    });

    finalText = result.text;
    totalTokens = result.usage.totalTokens;
    workflowRuns = extractWorkflowRunsFromGenerateText(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      if (terminatedBy === "natural") {
        terminatedBy = "aborted";
        finalText = "已取消";
      } else {
        finalText = stepTraces.at(-1)?.thought ?? "";
      }
    } else {
      terminatedBy = "error";
      finalText = `错误: ${e instanceof Error ? e.message : String(e)}`;
    }
  } finally {
    abortSignal?.removeEventListener("abort", abortRun);
  }

  const wallMs = Date.now() - wallStart;

  const reactResult: ReActResult = {
    text: finalText,
    steps: stepTraces,
    workflowRuns,
    totalTokens,
    totalMs: stepTraces.reduce((s, t) => s + t.elapsedMs, 0),
    wallClockMs: wallMs,
    terminatedBy,
  };

  onTurnComplete?.(toTurnCompleteInfo(reactResult));

  return reactResult;
}
