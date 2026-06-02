import { randomUUID } from "node:crypto";

import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../llm/provider.js";
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
  type InsightCandidateRecord,
  type InsightReActStepRecord,
  type InsightProposal,
  type ParsedExplorationWindow,
} from "../services/insightCandidates.js";

export const INSIGHT_REACT_MAX_STEPS = 5;

export interface InsightExplorationGraphInput {
  symbol: string;
  window: string;
  run_id?: string;
  exploration_prompt?: string;
  persist?: boolean;
  snapshot_limit?: number;
  outcome_limit?: number;
}

export interface InsightExplorationGraphResult {
  run_id: string;
  insight_id: string;
  window: ParsedExplorationWindow;
  react_steps: InsightReActStepRecord[];
  proposal: InsightProposal;
  persisted_candidate: InsightCandidateRecord | null;
}

export interface InsightExplorationGraphDeps {
  fetchSnapshots?: typeof fetchContextSnapshotsForSymbol;
  fetchOutcomes?: typeof fetchOutcomesForInsight;
  runReAct?: typeof runControlledInsightReAct;
  llm?: WorkflowLlmProvider;
  persist?: typeof createInsightCandidate;
}

export class InsightExplorationGraph {
  private readonly deps: Required<
    Pick<InsightExplorationGraphDeps, "fetchSnapshots" | "fetchOutcomes" | "runReAct" | "persist">
  > & { llm: WorkflowLlmProvider };

  constructor(deps: InsightExplorationGraphDeps = {}) {
    const llm = deps.llm ?? createWorkflowLlmProvider();
    this.deps = {
      fetchSnapshots: deps.fetchSnapshots ?? fetchContextSnapshotsForSymbol,
      fetchOutcomes: deps.fetchOutcomes ?? fetchOutcomesForInsight,
      runReAct: deps.runReAct ?? runControlledInsightReAct,
      persist: deps.persist ?? createInsightCandidate,
      llm,
    };
  }

  async explore(input: InsightExplorationGraphInput): Promise<InsightExplorationGraphResult> {
    const symbol = input.symbol.toUpperCase();
    const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
    const parsedWindow = parseExplorationWindow(input.window);

    const [snapshots, outcomes] = await Promise.all([
      this.deps.fetchSnapshots({
        symbol,
        limit: input.snapshot_limit ?? 20,
      }),
      this.deps.fetchOutcomes({
        symbol,
        limit: input.outcome_limit ?? 200,
      }),
    ]);

    const contextItems = extractWeightedItemsFromSnapshots(snapshots);
    const scopedOutcomes = filterOutcomesInWindow(outcomes, parsedWindow);

    const { steps, proposal } = await this.deps.runReAct({
      symbol,
      contextItems,
      outcomes: scopedOutcomes,
      maxSteps: INSIGHT_REACT_MAX_STEPS,
      exploration_prompt: input.exploration_prompt,
      propose: async (reactInput) => {
        try {
          return await this.deps.llm.generateInsightProposal({
            symbol,
            window_start: parsedWindow.window_start,
            window_end: parsedWindow.window_end,
            contextItems,
            outcomes: scopedOutcomes,
            react_steps: reactInput.steps,
            exploration_prompt: input.exploration_prompt,
          });
        } catch {
          return buildHeuristicInsightProposal(reactInput);
        }
      },
    });

    const payload = buildInsightCandidatePayload({
      run_id,
      symbol,
      window: parsedWindow,
      proposal,
    });

    const persist = input.persist ?? true;
    const persisted_candidate = persist
      ? await this.deps.persist(payload)
      : null;

    return {
      run_id,
      insight_id: payload.insight_id,
      window: parsedWindow,
      react_steps: steps,
      proposal,
      persisted_candidate,
    };
  }
}

export async function runInsightExplorationGraph(
  input: InsightExplorationGraphInput,
  deps?: InsightExplorationGraphDeps,
): Promise<InsightExplorationGraphResult> {
  return new InsightExplorationGraph(deps).explore(input);
}
