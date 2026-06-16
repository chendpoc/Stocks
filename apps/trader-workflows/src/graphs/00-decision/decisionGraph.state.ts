import type { DecisionEnvelope } from "../../llm/decisionEnvelope.js";
import type { ContextSnapshotRecord } from "../../types/context.js";
import type {
  PersistedModelDecision,
  ScheduledDecisionOutcome,
} from "../../types/decisions.js";
import type { EvidenceRef } from "./evidenceRefs.js";
import type { ContraGuardrailOutput } from "./contraResult.js";
import type { EvidenceGuardrailOutput } from "./evidenceResult.js";
import type {
  GateDecision,
  SwarmWorkerResult,
} from "./decisionGraph.llmNodes.js";

/** Pure pipeline state for DecisionGraph. */
export interface DecisionGraphState {
  run_id: string;
  thread_id: string;
  symbol: string;
  /** Default: `""` */
  setup_name: string;
  taskType: string;
  asof_ts: string;
  model_version: string;
  /** Default: `null` */
  snapshot: ContextSnapshotRecord | null;
  /** Default: `[]` */
  weighted_context_items: ContextSnapshotRecord["items_json"];
  /** Default: `[]` */
  evidence_refs: EvidenceRef[];
  /** Default: `null` */
  gate_decision: GateDecision | null;
  /** Default: `null` */
  evidence_result: EvidenceGuardrailOutput | null;
  /** Default: `null` */
  contra_result: ContraGuardrailOutput | null;
  /** Default: `[]` */
  swarm_worker_results: SwarmWorkerResult[];
  /** Default: `null` */
  confidence_contribution: number | null;
  /** Default: `null` */
  envelope: DecisionEnvelope | null;
  /** Default: `null` */
  decision: PersistedModelDecision | null;
  /** Default: `[]` */
  scheduled_outcomes: ScheduledDecisionOutcome[];
  /** Default: `false` */
  paper_execution_submitted: boolean;
  /** Append-only in pipeline merge (`errors` accumulator). Default: `[]` */
  errors: string[];
}

export function createInitialDecisionGraphState(
  input: Pick<
    DecisionGraphState,
    "run_id" | "thread_id" | "symbol" | "taskType" | "asof_ts" | "model_version"
  > &
    Partial<DecisionGraphState>,
): DecisionGraphState {
  return {
    setup_name: "",
    snapshot: null,
    weighted_context_items: [],
    evidence_refs: [],
    gate_decision: null,
    evidence_result: null,
    contra_result: null,
    swarm_worker_results: [],
    confidence_contribution: null,
    envelope: null,
    decision: null,
    scheduled_outcomes: [],
    paper_execution_submitted: false,
    errors: [],
    ...input,
  };
}
