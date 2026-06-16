import type { StepTrace, ReActResult } from "../llm/chatReAct.js";
import type { ProcessedContext } from "./processedContext.js";
import type { TaskClassification } from "./taskRouter.js";
import type { PermissionDecision } from "./permissionGate.js";

export type MemoryEventType =
  | "retrieved"
  | "proposed_write"
  | "committed_write"
  | "blocked_write";

export interface MemoryEvent {
  type: MemoryEventType;
  detail: string;
  at: string;
}

export interface ToolCallTrace {
  toolName: string;
  argsSummary: string;
  resultSummary: string;
  status: "ok" | "error" | "blocked";
  durationMs: number;
}

export interface DebugTrace {
  processedContextId?: string;
  contextLayerSummary: Record<string, number>;
  taskMode: string;
  routerReason: string;
  selectedTools: string[];
  activeTools: string[];
  toolCalls: ToolCallTrace[];
  memoryEvents: MemoryEvent[];
  decisionTrace: string[];
  steps: StepTrace[];
  termination: {
    reason: ReActResult["terminatedBy"];
    totalTokens: number;
    wallClockMs: number;
  };
}

export function buildDebugTrace(input: {
  processedContext?: ProcessedContext;
  classification: TaskClassification;
  activeTools: string[];
  permissionDecisions?: PermissionDecision[];
  memoryEvents?: MemoryEvent[];
  reactResult: ReActResult;
}): DebugTrace {
  const toolCalls: ToolCallTrace[] = input.reactResult.steps.flatMap((step) =>
    step.actions.map((action) => ({
      toolName: action.split("(")[0] ?? action,
      argsSummary: action,
      resultSummary: step.observations.slice(0, 120),
      status: step.observations.includes("[护栏") ? "blocked" as const : "ok" as const,
      durationMs: step.elapsedMs,
    })),
  );

  const blocked = input.permissionDecisions?.filter((d) => !d.allowed) ?? [];

  return {
    processedContextId: input.processedContext?.id,
    contextLayerSummary: input.processedContext?.tokenBudget.byLayer ?? {},
    taskMode: input.classification.mode,
    routerReason: input.classification.reason,
    selectedTools: input.activeTools,
    activeTools: input.activeTools,
    toolCalls,
    memoryEvents: input.memoryEvents ?? [],
    decisionTrace: [
      `observe: user message classified as ${input.classification.mode}`,
      `classify: ${input.classification.reason} (confidence=${input.classification.confidence})`,
      `select-tools: ${input.activeTools.length} active`,
      ...blocked.map((b) => `permission-blocked: ${b.toolName}`),
      `respond: terminatedBy=${input.reactResult.terminatedBy}`,
    ],
    steps: input.reactResult.steps,
    termination: {
      reason: input.reactResult.terminatedBy,
      totalTokens: input.reactResult.totalTokens,
      wallClockMs: input.reactResult.wallClockMs,
    },
  };
}

export function serializeDebugTrace(trace: DebugTrace): string {
  return JSON.stringify(trace, null, 2);
}
