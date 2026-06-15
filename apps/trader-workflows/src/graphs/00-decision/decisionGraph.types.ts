import type { DecisionEnvelope } from "../../llm/decisionEnvelope.js";
import type { WorkflowLlmProvider } from "../../llm/provider.js";
import {
  persistModelDecision,
  scheduleModelPathOutcomes,
} from "../../services/decisions.js";
import type { ContextSnapshotRecord } from "../../types/context.js";
import type { PersistedModelDecision, ScheduledDecisionOutcome } from "../../types/decisions.js";
import { buildAndPersistContextSnapshot } from "../../services/contextSnapshots.js";
import type { GateDecision, LlmNodeDeps } from "./decisionGraph.llmNodes.js";

export interface DecisionGraphInput {
  symbol: string;
  run_id?: string;
  taskType?: string;
  asof_ts?: string;
  model_version?: string;
  setup_name?: string;
  gate_decision?: GateDecision;
}

export interface DecisionGraphResult {
  run_id: string;
  snapshot: ContextSnapshotRecord;
  decision: PersistedModelDecision;
  envelope: DecisionEnvelope;
  scheduled_outcomes: ScheduledDecisionOutcome[];
  paper_execution_submitted: false;
}

export interface DecisionGraphDeps {
  buildContext?: typeof buildAndPersistContextSnapshot;
  llm?: WorkflowLlmProvider;
  persistDecision?: typeof persistModelDecision;
  scheduleOutcomes?: typeof scheduleModelPathOutcomes;
  llmNodes?: LlmNodeDeps;
}

/** @deprecated Use runDecisionGraph or the compiled decisionGraph export. */
export class DecisionGraph {
  constructor(private readonly deps: DecisionGraphDeps = {}) { }

  async run(input: DecisionGraphInput): Promise<DecisionGraphResult> {
    const { runDecisionGraph } = await import("./decisionGraph.js");
    return runDecisionGraph(input, this.deps);
  }
}
