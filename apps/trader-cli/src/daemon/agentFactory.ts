import { getAgentSystemPromptById, AGENT_IO, type AgentId } from "../llm/prompts/index.js";
import { bootstrapToolRegistry } from "../llm/toolRegistry.bootstrap.js";
import { resolveTools, type ToolScope } from "../llm/toolRegistry.js";
import {
  runDecisionWorkflow,
  type GateDecisionPayload,
  type RunDecisionWorkflowInput,
} from "../services/decisionWorkflow.js";
import type { WorkflowEnvelope } from "../services/workflowRunner.js";

export type AgentInputs = Record<string, unknown>;

export type AgentFactoryInput = {
  agentId: AgentId;
  toolScope: ToolScope;
};

export type AgentSpawnResult = {
  agentId: AgentId;
  prompt: string;
  toolScope: ToolScope;
  tools: string[];
  toolCount: number;
  inputs: AgentInputs;
  gate_decision: GateDecisionPayload | null;
  io: {
    produces: string[];
    consumes: string[];
  };
};

export type AgentExecuteResult = {
  agentId: AgentId;
  skipped: boolean;
  reason?: string;
  symbol?: string;
  workflow?: WorkflowEnvelope;
};

const AGENT_TOOL_SCOPE: Record<AgentId, ToolScope> = {
  daemon: "daemon",
  "pre-market": "chat",
  "mid-day-deep": "evidence",
  "swarm-lead": "evidence",
  "post-market": "chat",
  macro: "chat",
};

const DECISION_GRAPH_AGENT_IDS = new Set<AgentId>(["mid-day-deep", "swarm-lead"]);

export type AgentExecutorDeps = {
  runDecision?: (input: RunDecisionWorkflowInput) => WorkflowEnvelope;
};

let executorDeps: AgentExecutorDeps = {};

/** @internal test hook */
export function setAgentExecutorDepsForTests(deps: AgentExecutorDeps): void {
  executorDeps = deps;
}

/** @internal test hook */
export function resetAgentExecutorDepsForTests(): void {
  executorDeps = {};
}

async function ensureRegistryReady(): Promise<void> {
  await bootstrapToolRegistry();
}

export function getAgentFactoryInput(agentId: string): AgentFactoryInput {
  const valid: AgentId | undefined = Object.keys(AGENT_TOOL_SCOPE).find(
    (id): id is AgentId => id === agentId,
  );

  if (!valid) {
    throw new Error(`Unknown agentId: ${agentId}`);
  }

  return {
    agentId: valid,
    toolScope: AGENT_TOOL_SCOPE[valid],
  };
}

function normalizeSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.toUpperCase());
}

/** Map Daemon gate handoff inputs → DecisionGraph gate_decision. */
export function buildGateDecision(inputs: AgentInputs): GateDecisionPayload | null {
  const symbols = normalizeSymbols(inputs.symbols);
  if (symbols.length === 0) {
    return null;
  }

  const complexity_score =
    typeof inputs.complexityScore === "number" && Number.isFinite(inputs.complexityScore)
      ? inputs.complexityScore
      : 0.1;

  const setups =
    inputs.setups && typeof inputs.setups === "object" && !Array.isArray(inputs.setups)
      ? Object.fromEntries(
        Object.entries(inputs.setups as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
      : undefined;

  return {
    complexity_score,
    symbols,
    ...(setups && Object.keys(setups).length > 0 ? { setups } : {}),
  };
}

function resolveSetupName(
  inputs: AgentInputs,
  symbol: string,
): string | undefined {
  const setups =
    inputs.setups && typeof inputs.setups === "object" && !Array.isArray(inputs.setups)
      ? (inputs.setups as Record<string, unknown>)
      : undefined;
  const fromSetups = setups?.[symbol];
  if (typeof fromSetups === "string" && fromSetups.trim().length > 0) {
    return fromSetups;
  }
  if (typeof inputs.setupName === "string" && inputs.setupName.trim().length > 0) {
    return inputs.setupName;
  }
  if (typeof inputs.pattern === "string" && inputs.pattern.trim().length > 0) {
    return inputs.pattern;
  }
  return undefined;
}

/** Daemon 路由骨架：返回可观测的 handoff payload。 */
export async function spawn(
  agentId: string,
  inputs: AgentInputs = {},
): Promise<AgentSpawnResult> {
  const spec = getAgentFactoryInput(agentId);
  await ensureRegistryReady();

  const prompt = getAgentSystemPromptById(spec.agentId);
  const tools = resolveTools(spec.toolScope);
  const gate_decision = buildGateDecision(inputs);

  return {
    agentId: spec.agentId,
    prompt,
    toolScope: spec.toolScope,
    tools: Object.keys(tools),
    toolCount: Object.keys(tools).length,
    inputs,
    gate_decision,
    io: AGENT_IO[spec.agentId],
  };
}

/**
 * 对 mid-day-deep / swarm-lead handoff 触发 DecisionGraph（经 trader-workflows CLI）。
 * 其他 Agent 仅返回 skipped。
 */
export async function executeAgent(
  handoff: AgentSpawnResult,
  deps: AgentExecutorDeps = executorDeps,
): Promise<AgentExecuteResult> {
  if (!DECISION_GRAPH_AGENT_IDS.has(handoff.agentId)) {
    return {
      agentId: handoff.agentId,
      skipped: true,
      reason: "agent does not run DecisionGraph",
    };
  }

  const gate_decision = handoff.gate_decision ?? buildGateDecision(handoff.inputs);
  if (!gate_decision || gate_decision.symbols.length === 0) {
    return {
      agentId: handoff.agentId,
      skipped: true,
      reason: "missing gate symbols",
    };
  }

  const symbol = gate_decision.symbols[0];
  const runDecision = deps.runDecision ?? runDecisionWorkflow;
  const workflow = runDecision({
    symbol,
    setup_name: resolveSetupName(handoff.inputs, symbol),
    gate_decision,
  });

  return {
    agentId: handoff.agentId,
    skipped: false,
    symbol,
    workflow,
  };
}
