export type WorkflowRun = {
  runId: string;
  workflowId: string;
  label: string;
  startedAt: number;
};

type ToolCallLike = {
  toolCallId: string;
  args?: unknown;
};

type ToolResultLike = {
  toolCallId: string;
  toolName?: string;
  result?: unknown;
};

type GenerateTextLike = {
  steps?: Array<{
    toolCalls?: ToolCallLike[];
    toolResults?: ToolResultLike[];
  }>;
};

function readRunId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const runId = (value as Record<string, unknown>).runId;
  return typeof runId === "string" && runId.length > 0 ? runId : undefined;
}

function labelFromInputs(inputs: unknown): string {
  if (!inputs || typeof inputs !== "object") return "";
  const record = inputs as Record<string, unknown>;
  if (Array.isArray(record.symbols)) {
    return record.symbols.map(String).join(", ");
  }
  if (record.symbol) {
    return String(record.symbol);
  }
  return "";
}

/** Extract runWorkflow tool results from a multi-step generateText response. */
export function extractWorkflowRunsFromGenerateText(
  result: GenerateTextLike,
): WorkflowRun[] {
  const runs: WorkflowRun[] = [];
  const startedAt = Date.now();

  for (const step of result.steps ?? []) {
    const callsById = new Map(
      (step.toolCalls ?? []).map((call) => [call.toolCallId, call]),
    );
    for (const toolResult of step.toolResults ?? []) {
      if (toolResult.toolName !== "runWorkflow") continue;
      const call = callsById.get(toolResult.toolCallId);
      const args = (call?.args ?? {}) as Record<string, unknown>;
      const workflowId =
        typeof args.workflowId === "string" ? args.workflowId : "unknown";
      const runId = readRunId(toolResult.result) ?? `run_${startedAt}`;
      runs.push({
        runId,
        workflowId,
        label: labelFromInputs(args.inputs),
        startedAt,
      });
    }
  }

  return runs;
}
