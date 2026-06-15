import { prefixedId } from "../../utils/id.js";

import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../../llm/provider.js";
import {
  createInsightCandidate,
  fetchContextSnapshotsForSymbol,
  fetchLatestEvaluationReportForInsight,
  fetchOutcomesForInsight,
} from "../../data/insightCandidates.js";
import {
  buildHeuristicInsightProposal,
  buildInsightCandidatePayload,
  extractWeightedItemsFromSnapshots,
  filterOutcomesInWindow,
  parseExplorationWindow,
  runControlledInsightReAct,
} from "../../services/insightCandidates.js";
import { scheduleInsightCandidateOutcome } from "../../data/outcomes.js";
import {
  DEFAULT_INSIGHT_CANDIDATE_OUTCOME_HORIZON,
  isSupportedInsightCandidateOutcomeHorizon,
  type InsightCandidateOutcomeHorizon,
} from "../../services/outcomes.js";
import type { InsightExplorationGraphState } from "./insightExplorationGraph.state.js";
import {
  INSIGHT_REACT_MAX_STEPS,
  type InsightExplorationGraphResult,
} from "./insightExplorationGraph.types.js";

export class InsightSchedulingError extends Error {
  readonly insight_id: string;
  readonly horizon: string;
  readonly persisted: boolean;
  readonly schedulePayload: Record<string, unknown>;

  constructor(input: {
    insight_id: string;
    horizon: string;
    persisted: boolean;
    schedulePayload: Record<string, unknown>;
    cause: unknown;
  }) {
    const msg = `InsightCandidateOutcome scheduling failed after persist (insight_id=${input.insight_id}, horizon=${input.horizon}). Candidate is persisted; retry schedule with same insight_id+horizon to recover.`;
    super(msg, { cause: input.cause });
    this.name = "InsightSchedulingError";
    this.insight_id = input.insight_id;
    this.horizon = input.horizon;
    this.persisted = input.persisted;
    this.schedulePayload = input.schedulePayload;
  }
}

export interface InsightExplorationGraphNodeDeps {
  fetchSnapshots: typeof fetchContextSnapshotsForSymbol;
  fetchOutcomes: typeof fetchOutcomesForInsight;
  fetchEvaluationReport: typeof fetchLatestEvaluationReportForInsight;
  runReAct: typeof runControlledInsightReAct;
  llm: WorkflowLlmProvider;
  persist: typeof createInsightCandidate;
  scheduleOutcome: typeof scheduleInsightCandidateOutcome;
}

export function resolveInsightExplorationGraphNodeDeps(
  overrides: Partial<InsightExplorationGraphNodeDeps> = {},
): InsightExplorationGraphNodeDeps {
  return {
    fetchSnapshots: overrides.fetchSnapshots ?? fetchContextSnapshotsForSymbol,
    fetchOutcomes: overrides.fetchOutcomes ?? fetchOutcomesForInsight,
    fetchEvaluationReport: overrides.fetchEvaluationReport ?? fetchLatestEvaluationReportForInsight,
    runReAct: overrides.runReAct ?? runControlledInsightReAct,
    llm: overrides.llm ?? createWorkflowLlmProvider(),
    persist: overrides.persist ?? createInsightCandidate,
    scheduleOutcome: overrides.scheduleOutcome ?? scheduleInsightCandidateOutcome,
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
    const run_id = state.run_id || prefixedId("run_");
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
      evaluation_report_id: state.evaluation_report_id,
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
    const [snapshots, outcomes, evaluation_report] = await Promise.all([
      ensureDeps().fetchSnapshots({
        symbol: state.symbol,
        limit: state.snapshot_limit ?? 20,
      }),
      ensureDeps().fetchOutcomes({
        symbol: state.symbol,
        limit: state.outcome_limit ?? 200,
      }),
      ensureDeps()
        .fetchEvaluationReport({
          evaluation_report_id: state.evaluation_report_id,
          symbol: state.symbol,
        })
        .catch(() => null),
    ]);
    const context_items = extractWeightedItemsFromSnapshots(snapshots);
    const scoped_outcomes = filterOutcomesInWindow(outcomes, state.parsed_window);
    return { snapshots, outcomes, context_items, scoped_outcomes, evaluation_report };
  }

  async function run_insight_react(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.parsed_window) {
      throw new Error("InsightExplorationGraph state is incomplete: missing parsed_window");
    }

    let enrichedPrompt = state.exploration_prompt;
    if (state.evaluation_report?.sections) {
      const s = state.evaluation_report.sections;
      const parts: string[] = [];
      if (s.failure_modes.length > 0)
        parts.push(`Failure Modes: ${s.failure_modes.join("; ")}`);
      if (s.top_positive_patterns.length > 0)
        parts.push(`Positive Patterns: ${s.top_positive_patterns.join("; ")}`);
      if (s.data_gaps.length > 0)
        parts.push(`Data Gaps: ${s.data_gaps.join("; ")}`);
      if (parts.length > 0) {
        enrichedPrompt = `${enrichedPrompt ?? ""}\n\n--- Evaluation Report Context ---\n${parts.join("\n")}`.trim();
      }
    }

    const { steps, proposal } = await ensureDeps().runReAct({
      symbol: state.symbol,
      contextItems: state.context_items,
      outcomes: state.scoped_outcomes,
      maxSteps: INSIGHT_REACT_MAX_STEPS,
      exploration_prompt: enrichedPrompt,
      evaluation_report: state.evaluation_report,
      propose: async (reactInput) => {
        try {
          return await ensureDeps().llm.generateInsightProposal({
            symbol: state.symbol,
            window_start: state.parsed_window!.window_start,
            window_end: state.parsed_window!.window_end,
            contextItems: state.context_items,
            outcomes: state.scoped_outcomes,
            react_steps: reactInput.steps,
            exploration_prompt: enrichedPrompt,
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

  function resolveSchedulingHorizon(
    payload: InsightExplorationGraphState["candidate_payload"],
  ): InsightCandidateOutcomeHorizon {
    const h = payload?.candidate_json?.horizon;
    if (typeof h === "string" && isSupportedInsightCandidateOutcomeHorizon(h)) {
      return h;
    }
    return DEFAULT_INSIGHT_CANDIDATE_OUTCOME_HORIZON;
  }

  async function persist_insight_candidate(
    state: InsightExplorationGraphState,
  ): Promise<Partial<InsightExplorationGraphState>> {
    if (!state.candidate_payload) {
      throw new Error("InsightExplorationGraph state is incomplete: missing candidate_payload");
    }
    if (!state.persist) {
      return { persisted_candidate: null, scheduled_outcome: null };
    }
    const persisted_candidate = await ensureDeps().persist(state.candidate_payload);

    const horizon = resolveSchedulingHorizon(state.candidate_payload);
    const schedulePayload = {
      insight_id: state.candidate_payload.insight_id,
      symbol: state.candidate_payload.symbols_json[0] ?? state.symbol,
      horizon,
      evidence_refs: state.candidate_payload.evidence_refs_json,
      reason_codes: [] as string[],
      outcome_json: {
        run_id: state.run_id,
        thesis: state.candidate_payload.thesis,
      },
    };

    let scheduled_outcome;
    try {
      scheduled_outcome = await ensureDeps().scheduleOutcome(schedulePayload);
    } catch (error) {
      throw new InsightSchedulingError({
        insight_id: state.candidate_payload.insight_id,
        horizon,
        persisted: true,
        schedulePayload,
        cause: error,
      });
    }

    return { persisted_candidate, scheduled_outcome };
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
    scheduled_outcome: state.scheduled_outcome,
  };
}
