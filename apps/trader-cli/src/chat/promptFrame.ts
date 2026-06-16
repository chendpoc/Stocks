import type { CoreTool } from "ai";
import type { ChatMessage } from "../tui/types.js";
import type { ProcessedContext } from "./processedContext.js";
import { estimateLayerTokens, DEFAULT_TOKEN_BUDGET } from "./tokenBudget.js";

export interface PromptFrame {
  system: string;
  messages: ChatMessage[];
  tools: Record<string, CoreTool>;
  activeTools: string[];
  processedContextId?: string;
}

function renderLayerBlock(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

export function renderPromptFrameSystem(ctx: ProcessedContext): string {
  const sections = [
    renderLayerBlock("Core", [
      ctx.core.identity,
      ...ctx.core.constraints.map((c) => `- ${c}`),
      `语言: ${ctx.core.language}`,
    ].join("\n")),
    renderLayerBlock("Market Context", JSON.stringify(ctx.marketContext, null, 2)),
    renderLayerBlock("Task", JSON.stringify(ctx.task, null, 2)),
    renderLayerBlock(
      "Tools",
      ctx.tools.filter((t) => t.selected).map((t) => `- ${t.name} (${t.group}): ${t.summary}`).join("\n") || "(none)",
    ),
    renderLayerBlock("Retrieved Memory", JSON.stringify(ctx.retrieved, null, 2)),
    renderLayerBlock("Workspace", JSON.stringify(ctx.workspace, null, 2)),
    renderLayerBlock("Risk Policy", JSON.stringify(ctx.riskPolicy, null, 2)),
  ];
  return sections.join("\n\n");
}

export function buildPromptFrame(input: {
  ctx: ProcessedContext;
  baseSystem: string;
  messages: ChatMessage[];
  tools: Record<string, CoreTool>;
  activeTools: string[];
  processedContextId?: string;
}): PromptFrame {
  const layered = renderPromptFrameSystem(input.ctx);
  const budgetNote = `Token budget: ${input.ctx.tokenBudget.totalEstimated}/${input.ctx.tokenBudget.budgetLimit}`;
  const system = `${input.baseSystem}\n\n--- ProcessedContext ---\n${layered}\n\n${budgetNote}`;

  return {
    system,
    messages: input.messages,
    tools: input.tools,
    activeTools: input.activeTools,
    processedContextId: input.processedContextId,
  };
}

export function attachTokenBudgetToContext(ctx: ProcessedContext): ProcessedContext {
  const systemPreview = renderPromptFrameSystem(ctx);
  const report = estimateLayerTokens(systemPreview, DEFAULT_TOKEN_BUDGET);
  return {
    ...ctx,
    tokenBudget: report,
  };
}
