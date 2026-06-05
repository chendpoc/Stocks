import { randomUUID } from "node:crypto";

import {
  DecisionEnvelopeValidationError,
  validateDecisionEnvelope,
} from "../../llm/decisionEnvelope.js";
import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../../llm/provider.js";
import {
  buildAndPersistContextSnapshot,
  type ContextSnapshotRecord,
} from "../../services/contextSnapshots.js";
import {
  OUTCOME_HORIZONS,
  persistModelDecision,
  scheduleModelPathOutcomes,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../../services/decisions.js";
import type { DecisionGraphState } from "./decisionGraph.state.js";
import { extractEvidenceRefs } from "./evidenceRefs.js";

export interface DecisionGraphNodeDeps {
  buildContext: typeof buildAndPersistContextSnapshot;
  llm: WorkflowLlmProvider;
  persistDecision: typeof persistModelDecision;
  scheduleOutcomes: typeof scheduleModelPathOutcomes;
}

export function resolveDecisionGraphNodeDeps(
  overrides: Partial<DecisionGraphNodeDeps> = {},
): DecisionGraphNodeDeps {
  return {
    buildContext: overrides.buildContext ?? buildAndPersistContextSnapshot,
    llm: overrides.llm ?? createWorkflowLlmProvider(),
    persistDecision: overrides.persistDecision ?? persistModelDecision,
    scheduleOutcomes: overrides.scheduleOutcomes ?? scheduleModelPathOutcomes,
  };
}

/** One persisted model decision per context snapshot (immutable decision_json). */
export function deterministicDecisionId(snapshot_id: string): string {
  const suffix = snapshot_id.startsWith("snap-")
    ? snapshot_id.slice(5)
    : snapshot_id;
  return `dec_${suffix.replace(/-/g, "")}`;
}

export function createDecisionGraphNodes(
  overrides: Partial<DecisionGraphNodeDeps> = {},
) {
  let deps: DecisionGraphNodeDeps | null = null;
  const ensureDeps = (): DecisionGraphNodeDeps => {
    if (!deps) {
      deps = resolveDecisionGraphNodeDeps(overrides);
    }
    return deps;
  };
  async function normalize_input(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const run_id = state.run_id || `run_${randomUUID().replace(/-/g, "")}`;
    const asof_ts = state.asof_ts || new Date().toISOString();
    return {
      run_id,
      thread_id: run_id,
      symbol: (state.symbol || "").toUpperCase(),
      taskType: state.taskType || "decision",
      asof_ts,
      model_version: state.model_version || "stage1-v0",
      paper_execution_submitted: false,
    };
  }

  async function build_context_snapshot(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const snapshot = await ensureDeps().buildContext({
      symbol: state.symbol,
      taskType: state.taskType,
      asof_ts: state.asof_ts,
    });
    return {
      snapshot,
      weighted_context_items: snapshot.items_json ?? [],
      evidence_refs: extractEvidenceRefs(snapshot),
    };
  }

  async function generate_decision_envelope(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const snapshot = state.snapshot as ContextSnapshotRecord;
    const envelope = await ensureDeps().llm.generateDecisionEnvelope({
      symbol: state.symbol,
      asof_ts: state.asof_ts,
      contextItems: snapshot.items_json,
    });
    return { envelope };
  }

  async function validate_decision_envelope(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    if (!state.envelope) {
      throw new DecisionEnvelopeValidationError("Missing decision envelope");
    }
    validateDecisionEnvelope(state.envelope);
    return {};
  }

  async function persist_model_decision(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const snapshot = state.snapshot as ContextSnapshotRecord;
    const decision = await ensureDeps().persistDecision({
      decision_id: deterministicDecisionId(snapshot.snapshot_id),
      run_id: state.run_id,
      snapshot_id: snapshot.snapshot_id,
      envelope: state.envelope!,
      model_version: state.model_version,
    });
    return { decision };
  }

  async function schedule_model_path_outcomes(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const decision = state.decision as PersistedModelDecision;
    const scheduled_outcomes = await ensureDeps().scheduleOutcomes({
      decision_id: decision.decision_id,
      symbol: state.symbol,
      asof_ts: state.asof_ts,
    });
    if (scheduled_outcomes.length !== OUTCOME_HORIZONS.length) {
      throw new Error(
        `expected ${OUTCOME_HORIZONS.length} scheduled outcomes, got ${scheduled_outcomes.length}`,
      );
    }
    return { scheduled_outcomes };
  }

  async function final_output(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    return { paper_execution_submitted: false };
  }

  return {
    normalize_input,
    build_context_snapshot,
    generate_decision_envelope,
    validate_decision_envelope,
    persist_model_decision,
    schedule_model_path_outcomes,
    final_output,
  };
}

export type DecisionGraphNodes = ReturnType<typeof createDecisionGraphNodes>;

export const DECISION_GRAPH_NODE_NAMES = [
  "normalize_input",
  "build_context_snapshot",
  "generate_decision_envelope",
  "validate_decision_envelope",
  "persist_model_decision",
  "schedule_model_path_outcomes",
  "final_output",
] as const;

export function stateToDecisionGraphResult(
  state: DecisionGraphState,
): {
  run_id: string;
  snapshot: ContextSnapshotRecord;
  decision: PersistedModelDecision;
  envelope: NonNullable<DecisionGraphState["envelope"]>;
  scheduled_outcomes: ScheduledDecisionOutcome[];
  paper_execution_submitted: false;
} {
  if (!state.snapshot || !state.decision || !state.envelope) {
    throw new Error("DecisionGraph state is incomplete");
  }
  return {
    run_id: state.run_id,
    snapshot: state.snapshot,
    decision: state.decision,
    envelope: state.envelope,
    scheduled_outcomes: state.scheduled_outcomes,
    paper_execution_submitted: false,
  };
}
