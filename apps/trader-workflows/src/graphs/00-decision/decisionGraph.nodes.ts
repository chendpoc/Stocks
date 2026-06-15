import { prefixedId } from "../../utils/id.js";

import {
  type DecisionEnvelope,
  DecisionEnvelopeValidationError,
  validateDecisionEnvelope,
} from "../../llm/decisionEnvelope.js";
import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../../llm/provider.js";
import { buildAndPersistContextSnapshot } from "../../data/contextSnapshots.js";
import {
  persistModelDecision,
  scheduleModelPathOutcomes,
} from "../../data/decisions.js";
import type { ContextSnapshotRecord } from "../../types/context.js";
import {
  OUTCOME_HORIZONS,
} from "../../services/decisions.js";
import type { PersistedModelDecision, ScheduledDecisionOutcome } from "../../types/decisions.js";
import type { DecisionGraphState } from "./decisionGraph.state.js";
import {
  buildEvidence,
  generateContraWithFallback,
  runSwarmLead,
  runSwarmWorkers,
  shouldUseSwarm,
  type LlmNodeDeps,
} from "./decisionGraph.llmNodes.js";
import { getDecisionGraphLlmDeps } from "../../llm/decisionGraphLlmDeps.js";
import { extractEvidenceRefs } from "./evidenceRefs.js";

export interface DecisionGraphNodeDeps {
  buildContext: typeof buildAndPersistContextSnapshot;
  llm: WorkflowLlmProvider;
  persistDecision: typeof persistModelDecision;
  scheduleOutcomes: typeof scheduleModelPathOutcomes;
  llmNodes?: LlmNodeDeps;
}

export function resolveDecisionGraphNodeDeps(
  overrides: Partial<DecisionGraphNodeDeps> = {},
): DecisionGraphNodeDeps {
  return {
    buildContext: overrides.buildContext ?? buildAndPersistContextSnapshot,
    llm: overrides.llm ?? createWorkflowLlmProvider(),
    persistDecision: overrides.persistDecision ?? persistModelDecision,
    scheduleOutcomes: overrides.scheduleOutcomes ?? scheduleModelPathOutcomes,
    llmNodes: overrides.llmNodes ?? getDecisionGraphLlmDeps(),
  };
}

/** One persisted model decision per context snapshot (immutable decision_json). */
export function deterministicDecisionId(snapshot_id: string): string {
  const suffix = snapshot_id.startsWith("snap-")
    ? snapshot_id.slice(5)
    : snapshot_id;
  return `dec_${suffix.replace(/-/g, "")}`;
}

export function applyMarketRegimeRiskAdjustment(
  envelope: DecisionEnvelope,
): DecisionEnvelope {
  const state = envelope.market_regime?.state?.toLowerCase();
  if (state !== "volatile" && state !== "crisis") {
    return envelope;
  }
  return {
    ...envelope,
    confidence: Math.round(envelope.confidence * 0.75 * 10000) / 10000,
  };
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
    const run_id = state.run_id || prefixedId("run_");
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

  function resolveGate(state: DecisionGraphState) {
    return (
      state.gate_decision ?? {
        complexity_score: 0.1,
        symbols: [state.symbol],
      }
    );
  }

  async function build_evidence(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    if (shouldUseSwarm(resolveGate(state))) {
      return {};
    }
    const setupName = state.setup_name || "Unknown";
    const evidence_result = await buildEvidence(
      {
        symbol: state.symbol,
        setupName,
      },
      ensureDeps().llmNodes,
    );
    return { evidence_result };
  }

  async function generate_contra(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    if (shouldUseSwarm(resolveGate(state))) {
      return {};
    }
    const evidence = state.evidence_result;
    if (!evidence) {
      return {};
    }
    const setupName = state.setup_name || "Unknown";
    const contra_result = await generateContraWithFallback(
      {
        evidenceText: evidence.evidence_text,
        symbol: state.symbol,
        setupName,
        evidenceSourceCount: evidence.evidence_sources.length,
      },
      ensureDeps().llmNodes,
    );
    const confidence_contribution = Math.min(
      evidence.confidence_contribution,
      contra_result.quality_score,
    );
    return { contra_result, confidence_contribution };
  }

  async function run_swarm_analysis(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const gate = resolveGate(state);
    if (!shouldUseSwarm(gate)) {
      return {};
    }
    const workers = await runSwarmWorkers(gate, ensureDeps().llmNodes);
    const lead = await runSwarmLead(gate, workers, ensureDeps().llmNodes);
    const evidenceConf = Math.max(
      ...lead.perSymbolEvidence.map((e) => e.confidence_contribution),
      0,
    );
    return {
      swarm_worker_results: workers,
      evidence_result: {
        evidence_text: lead.leadSummary,
        confidence_contribution: evidenceConf,
        evidence_sources: lead.perSymbolEvidence.flatMap(
          (e) => e.evidence_sources,
        ),
        ...(lead.perSymbolEvidence.some((e) => e.needs_review)
          ? { needs_review: true }
          : {}),
      },
      contra_result: lead.contra,
      confidence_contribution: Math.min(
        evidenceConf,
        lead.contra.quality_score,
      ),
    };
  }

  async function generate_decision_envelope(
    state: DecisionGraphState,
  ): Promise<Partial<DecisionGraphState>> {
    const snapshot = state.snapshot as ContextSnapshotRecord;
    const evidence = state.evidence_result;
    const contra = state.contra_result;
    const risk_flags = [
      ...(evidence?.risk_flags ?? []),
      ...(contra?.risk_flags ?? []),
    ];
    const envelope = await ensureDeps().llm.generateDecisionEnvelope({
      symbol: state.symbol,
      asof_ts: state.asof_ts,
      contextItems: snapshot.items_json,
      llmAnalysis: {
        evidence_text: evidence?.evidence_text,
        contra_text: contra?.contra_text,
        confidence_contribution: state.confidence_contribution ?? undefined,
        risk_flags: risk_flags.length > 0 ? risk_flags : undefined,
      },
    });
    return { envelope: applyMarketRegimeRiskAdjustment(envelope) };
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
    build_evidence,
    generate_contra,
    run_swarm_analysis,
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
  "build_evidence",
  "generate_contra",
  "run_swarm_analysis",
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
