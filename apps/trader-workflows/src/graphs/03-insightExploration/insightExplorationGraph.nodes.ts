import { randomUUID } from "node:crypto";

import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../../llm/provider.js";
import {
  buildHeuristicInsightProposal,
  buildInsightCandidatePayload,
  createInsightCandidate,
  extractWeightedItemsFromSnapshots,
  fetchContextSnapshotsForSymbol,
  fetchOutcomesForInsight,
  filterOutcomesInWindow,
  parseExplorationWindow,
  runControlledInsightReAct,
} from "../../services/insightCandidates.js";
import type { InsightExplorationGraphState } from "./insightExplorationGraph.state.js";
import {
  INSIGHT_REACT_MAX_STEPS,
  type InsightExplorationGraphResult,
} from "./insightExplorationGraph.types.js";

export interface InsightExplorationGraphNodeDeps {
  fetchSnapshots: typeof fetchContextSnapshotsForSymbol;
  fetchOutcomes: typeof fetchOutcomesForInsight;
  runReAct: typeof runControlledInsightReAct;
  llm: WorkflowLlmProvider;
  persist: typeof createInsightCandidate;
}

export function resolveInsightExplorationGraphNodeDeps(
  overrides: Partial<InsightExplorationGraphNodeDeps> = {},
): InsightExplorationGraphNodeDeps {
  return {
    fetchSnapshots: overrides.fetchSnapshots ?? fetchContextSnapshotsForSymbol,
    fetchOutcomes: overrides.fetchOutcomes ?? fetchOutcomesForInsight,
    runReAct: overrides.runReAct ?? runControlledInsightReAct,
    llm: overrides.llm ?? createWorkflowLlmProvider(),
    persist: overrides.persist ?? createInsightCandidate,
  };
}

export function createInsightExplorationGraphNodes(
  overrides: Partial<InsightExplorationGraphNodeDeps> = {},
) {
  let deps: InsightExplorationGraphNodeDeps | null = null;
  const ensureDeps = (): InsightExplorationGraphNodeDeps => {
    if (!deps) {
      deps = resolveInsightExplorationGraphNodeDeps(overrides);
    }
    return deps;
  };

  async function normalize_input(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    const run_id = state.run_id || `run_${randomUUID().replace(/-/g, "")}`;
    const symbol = (state.symbol || "").toUpperCase();
    if (!symbol) {
      throw new Error("InsightExplorationGraph requires symbol");
    }
    if (!state.window) {
      throw new Error("InsightExplorationGraph requires window");
    }
    return {
      run_id,
      thread_id: state.thread_id || run_id,
      symbol,
      window: state.window,
      parsed_window: parseExplorationWindow(state.window),
      exploration_prompt: state.exploration_prompt,
      snapshot_limit: state.snapshot_limit ?? 20,
      outcome_limit: state.outcome_limit ?? 200,
      persist: state.persist ?? true,
    };
  }

  async function fetch_exploration_inputs(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.parsed_window) {
      throw new Error("InsightExplorationGraph state is incomplete: missing parsed_window");
    }
    const [snapshots, outcomes] = await Promise.all([
      ensureDeps().fetchSnapshots({
        symbol: state.symbol,
        limit: state.snapshot_limit ?? 20,
      }),
      ensureDeps().fetchOutcomes({
        symbol: state.symbol,
        limit: state.outcome_limit ?? 200,
      }),
    ]);
    const context_items = extractWeightedItemsFromSnapshots(snapshots);
    const scoped_outcomes = filterOutcomesInWindow(outcomes, state.parsed_window);
    return { snapshots, outcomes, context_items, scoped_outcomes };
  }

  async function run_insight_react(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.parsed_window) {
      throw new Error("InsightExplorationGraph state is incomplete: missing parsed_window");
    }
    const { steps, proposal } = await ensureDeps().runReAct({
      symbol: state.symbol,
      contextItems: state.context_items,
      outcomes: state.scoped_outcomes,
      maxSteps: INSIGHT_REACT_MAX_STEPS,
      exploration_prompt: state.exploration_prompt,
      propose: async (reactInput) => {
        try {
          return await ensureDeps().llm.generateInsightProposal({
            symbol: state.symbol,
            window_start: state.parsed_window!.window_start,
            window_end: state.parsed_window!.window_end,
            contextItems: state.context_items,
            outcomes: state.scoped_outcomes,
            react_steps: reactInput.steps,
            exploration_prompt: state.exploration_prompt,
          });
        } catch {
          return buildHeuristicInsightProposal(reactInput);
        }
      },
    });
    return { react_steps: steps, proposal };
  }

  async function build_insight_payload(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.parsed_window || !state.proposal) {
      throw new Error("InsightExplorationGraph state is incomplete");
    }
    const candidate_payload = buildInsightCandidatePayload({
      run_id: state.run_id,
      symbol: state.symbol,
      window: state.parsed_window,
      proposal: state.proposal,
    });
    return {
      candidate_payload,
      insight_id: candidate_payload.insight_id,
    };
  }

  async function persist_insight_candidate(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.candidate_payload) {
      throw new Error("InsightExplorationGraph state is incomplete: missing candidate_payload");
    }
    if (!state.persist) {
      return { persisted_candidate: null };
    }
    const persisted_candidate = await ensureDeps().persist(state.candidate_payload);
    return { persisted_candidate };
  }

  async function final_output(
    _state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    return {};
  }

  return {
    normalize_input,
    fetch_exploration_inputs,
    run_insight_react,
    build_insight_payload,
    persist_insight_candidate,
    final_output,
  };
}

export type InsightExplorationGraphNodes = ReturnType<typeof createInsightExplorationGraphNodes>;

export const INSIGHT_EXPLORATION_GRAPH_NODE_NAMES = [
  "normalize_input",
  "fetch_exploration_inputs",
  "run_insight_react",
  "build_insight_payload",
  "persist_insight_candidate",
  "final_output",
] as const;

export function stateToInsightExplorationGraphResult(
  state: InsightExplorationGraphState,
): InsightExplorationGraphResult {
  if (!state.run_id || !state.parsed_window || !state.proposal || !state.insight_id) {
    throw new Error("InsightExplorationGraph state is incomplete");
  }
  return {
    run_id: state.run_id,
    insight_id: state.insight_id,
    window: state.parsed_window,
    react_steps: state.react_steps,
    proposal: state.proposal,
    persisted_candidate: state.persisted_candidate,
  };
}
