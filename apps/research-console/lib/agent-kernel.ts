import type {
  AgentChatMessage,
  AgentResponseEnvelope,
} from "@stock-summary/summary-core";
import { loadResearchContext } from "./context";
import { persistAgentRunEvidence } from "./agent-evidence";
import { createResearchAgentProvider, type ResearchAgentProvider } from "./agent-provider";
import { executeResearchTool, normalizeResearchToolCall } from "./agent-tools";
import {
  buildOpportunityReasoning,
  buildReasoningInputFromResearchContext,
} from "./opportunity-reasoning";
import { authorizeResearchTool, isResearchToolName } from "./tool-policy";

const MAX_TOOL_PLANNING_ROUNDS = 3;

export type RunResearchAgentInput = {
  day?: string;
  message: string;
  messages?: AgentChatMessage[];
  provider?: ResearchAgentProvider;
};

function toolCallKey(toolCall: { name: string; input?: Record<string, string> }) {
  return JSON.stringify([toolCall.name, toolCall.input ?? {}]);
}

function summarizeConversation(message: string, messages: AgentChatMessage[] = []) {
  const recent = [...messages, { role: "user" as const, content: message }]
    .filter((item) => item.content.trim())
    .slice(-4)
    .map((item) => `${item.role}: ${item.content.trim()}`);

  return recent.length ? recent.join(" / ") : "当前是新的机会观察对话。";
}

export async function runResearchAgent(input: RunResearchAgentInput): Promise<AgentResponseEnvelope> {
  const { provider: injectedProvider, ...agentInput } = input;
  const context = await loadResearchContext(input.day);
  const resolvedAgentInput = { ...agentInput, day: context.day };
  const opportunity_reasoning = buildOpportunityReasoning(
    buildReasoningInputFromResearchContext(context),
  );
  const provider = injectedProvider ?? createResearchAgentProvider();
  const conversation_summary = summarizeConversation(input.message, input.messages);
  const tool_trace: AgentResponseEnvelope["tool_trace"] = [];
  const policy_decisions: AgentResponseEnvelope["policy_decisions"] = [];
  const planned_tool_calls: AgentResponseEnvelope["toolCalls"] = [];
  const seenToolCalls = new Set<string>();

  for (let round = 0; round < MAX_TOOL_PLANNING_ROUNDS; round += 1) {
    const toolPlan = await provider.selectToolPlan({
      ...resolvedAgentInput,
      context,
      opportunityReasoning: opportunity_reasoning,
      toolTrace: tool_trace,
      policyDecisions: policy_decisions,
      conversationSummary: conversation_summary,
      round,
    });
    const toolCalls = toolPlan
      .map((toolCall) => normalizeResearchToolCall(toolCall))
      .filter((toolCall) => {
        const key = toolCallKey(toolCall);
        if (seenToolCalls.has(key)) return false;
        seenToolCalls.add(key);
        return true;
      });

    if (!toolCalls.length) break;

    const roundDecisions = toolCalls.map((toolCall) => authorizeResearchTool(toolCall.name));
    policy_decisions.push(...roundDecisions);
    planned_tool_calls.push(...toolCalls);

    const allowedToolCalls = toolCalls.filter((toolCall, index) =>
      roundDecisions[index]?.status === "allowed" && isResearchToolName(toolCall.name),
    );
    if (!allowedToolCalls.length) break;

    const roundTrace = await Promise.all(
      allowedToolCalls.map((toolCall) => executeResearchTool(toolCall, context)),
    );
    tool_trace.push(...roundTrace);
  }

  const response = await provider.generateResponse({
    ...resolvedAgentInput,
    context,
    opportunityReasoning: opportunity_reasoning,
    toolTrace: tool_trace,
    policyDecisions: policy_decisions,
    conversationSummary: conversation_summary,
  });

  const baseResponse: Omit<AgentResponseEnvelope, "run_id" | "evidence_log_path"> = {
    ...response,
    hypothesis:
      opportunity_reasoning.candidateOpportunities[0]?.thesis ??
      opportunity_reasoning.adminTheory.summary ??
      "当前资料不足以形成单一高置信假设。",
    planSteps: opportunity_reasoning.researchPlan,
    toolCalls: planned_tool_calls,
    approvalRequired: tool_trace.some((tool) => tool.approval_required),
    executionTrace: tool_trace,
    marketJudgement: opportunity_reasoning.reasoningSummary,
    invalidation: opportunity_reasoning.invalidationPlan,
    opportunity_reasoning,
    conversation_summary,
    provider: provider.mode,
    provider_status: response.provider_status,
    tool_trace,
    policy_decisions,
    used_context: [
      context.opportunityPath ?? "docs/opportunities",
      context.sourceSummaryPath ?? "docs/summaries",
      `data/structured/${context.day}/${context.day}.json`,
      "local-staged-opportunity-reasoning",
    ],
  };
  const evidence = await persistAgentRunEvidence({
    day: context.day,
    message: input.message,
    messages: input.messages,
    context,
    response: baseResponse,
  });

  return {
    ...baseResponse,
    ...evidence,
  };
}
