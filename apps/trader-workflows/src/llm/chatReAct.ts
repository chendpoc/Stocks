/**
 * Workflow-local ReAct wrapper — mirrors trader-cli chatReAct for Swarm workers.
 */

import {
  generateText,
  type CoreTool,
  type LanguageModel,
  type ToolCall,
  type ToolResult,
} from "ai";

export type ReActMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ReActOptions = {
  model: LanguageModel;
  system: string;
  messages: ReActMessage[];
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  maxEmptySteps?: number;
  maxTokens?: number;
  maxRetries?: number;
  activeTools?: string[];
};

export type ReActResult = {
  text: string;
  wallClockMs: number;
  terminatedBy: "natural" | "max_steps" | "empty_loop" | "aborted" | "error";
};

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_MAX_EMPTY_STEPS = 2;
const DEFAULT_MAX_TOKENS = 50_000;
const DEFAULT_MAX_RETRIES = 2;

function isSubstantive(text: string): boolean {
  return text.replace(/\s/g, "").length > 20;
}

function summarizeActions(toolCalls: ToolCall<string, unknown>[]): string[] {
  return toolCalls.map((tc) => tc.toolName);
}

function summarizeObservations(toolResults: ToolResult<string, unknown, unknown>[]): string {
  return toolResults
    .map((tr) => {
      const r = tr.result;
      if (typeof r === "string") return r.slice(0, 120);
      if (r && typeof r === "object") {
        return `{ ${Object.keys(r).slice(0, 5).join(", ")} }`;
      }
      return String(r).slice(0, 120);
    })
    .join(" | ");
}

export async function chatReAct(opts: ReActOptions): Promise<ReActResult> {
  const {
    model,
    system,
    messages,
    tools,
    maxSteps = DEFAULT_MAX_STEPS,
    maxEmptySteps = DEFAULT_MAX_EMPTY_STEPS,
    maxTokens = DEFAULT_MAX_TOKENS,
    maxRetries = DEFAULT_MAX_RETRIES,
    activeTools,
  } = opts;

  let totalTokens = 0;
  let emptyStepCount = 0;
  const wallStart = Date.now();
  let terminatedBy: ReActResult["terminatedBy"] = "natural";
  let finalText = "";
  const runController = new AbortController();

  try {
    const result = await generateText({
      model,
      system,
      messages,
      tools,
      maxSteps,
      maxRetries,
      abortSignal: runController.signal,
      toolChoice: "auto",
      ...(activeTools && activeTools.length > 0
        ? { experimental_activeTools: activeTools }
        : {}),
      onStepFinish: async ({ text, toolCalls, toolResults, usage }) => {
        const stepTokens = (usage?.totalTokens ?? 0) - totalTokens;
        totalTokens = usage?.totalTokens ?? totalTokens;
        const actions = summarizeActions(toolCalls ?? []);
        summarizeObservations(toolResults ?? []);

        if (actions.length === 0 && !isSubstantive(text)) {
          emptyStepCount += 1;
          if (emptyStepCount >= maxEmptySteps) {
            terminatedBy = "empty_loop";
            runController.abort();
          }
        } else {
          emptyStepCount = 0;
        }

        if (totalTokens > maxTokens) {
          terminatedBy = "max_steps";
          runController.abort();
        }
        if ((toolCalls?.length ?? 0) > 0 || isSubstantive(text)) {
          void stepTokens;
        }
      },
    });

    finalText = result.text;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      terminatedBy = terminatedBy === "natural" ? "aborted" : terminatedBy;
    } else {
      terminatedBy = "error";
      finalText = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    text: finalText,
    wallClockMs: Date.now() - wallStart,
    terminatedBy,
  };
}
