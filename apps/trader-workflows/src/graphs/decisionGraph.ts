import { randomUUID } from "node:crypto";

import {
  type DecisionEnvelope,
  DecisionEnvelopeValidationError,
  validateDecisionEnvelope,
} from "../llm/decisionEnvelope.js";
import {
  createWorkflowLlmProvider,
  type WorkflowLlmProvider,
} from "../llm/provider.js";
import {
  buildAndPersistContextSnapshot,
  type ContextSnapshotRecord,
} from "../services/contextSnapshots.js";
import {
  OUTCOME_HORIZONS,
  persistModelDecision,
  scheduleModelPathOutcomes,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../services/decisions.js";

export interface DecisionGraphInput {
  symbol: string;
  run_id?: string;
  taskType?: string;
  asof_ts?: string;
  model_version?: string;
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
}

export class DecisionGraph {
  private readonly deps: Required<DecisionGraphDeps>;

  constructor(deps: DecisionGraphDeps = {}) {
    this.deps = {
      buildContext: deps.buildContext ?? buildAndPersistContextSnapshot,
      llm: deps.llm ?? createWorkflowLlmProvider(),
      persistDecision: deps.persistDecision ?? persistModelDecision,
      scheduleOutcomes: deps.scheduleOutcomes ?? scheduleModelPathOutcomes,
    };
  }

  async run(input: DecisionGraphInput): Promise<DecisionGraphResult> {
    const symbol = input.symbol.toUpperCase();
    const run_id = input.run_id ?? `run_${randomUUID().replace(/-/g, "")}`;
    const asof_ts = input.asof_ts ?? new Date().toISOString();

    const snapshot = await this.deps.buildContext({
      symbol,
      taskType: input.taskType ?? "decision",
      asof_ts,
    });

    let envelope: DecisionEnvelope;
    try {
      envelope = await this.deps.llm.generateDecisionEnvelope({
        symbol,
        contextItems: snapshot.items_json,
      });
      validateDecisionEnvelope(envelope);
    } catch (error) {
      if (error instanceof DecisionEnvelopeValidationError) {
        throw error;
      }
      throw error;
    }

    const decision = await this.deps.persistDecision({
      run_id,
      snapshot_id: snapshot.snapshot_id,
      envelope,
      model_version: input.model_version ?? "stage1-v0",
    });

    const scheduled_outcomes = await this.deps.scheduleOutcomes({
      decision_id: decision.decision_id,
      symbol,
      asof_ts,
    });

    if (scheduled_outcomes.length !== OUTCOME_HORIZONS.length) {
      throw new Error(
        `expected ${OUTCOME_HORIZONS.length} scheduled outcomes, got ${scheduled_outcomes.length}`,
      );
    }

    return {
      run_id,
      snapshot,
      decision,
      envelope,
      scheduled_outcomes,
      paper_execution_submitted: false,
    };
  }
}

export async function runDecisionGraph(
  input: DecisionGraphInput,
  deps?: DecisionGraphDeps,
): Promise<DecisionGraphResult> {
  return new DecisionGraph(deps).run(input);
}
