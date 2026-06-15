import {
  type Stage1RunStatus,
  STAGE1_RUN_STATUSES,
} from "../runtime/checkpointStore.js";
import type { Stage1RuntimeResumeHandlers } from "../runtime/stage1Runtime.js";
import { runDecisionGraph } from "../graphs/00-decision/decisionGraph.js";
import { runDueOutcomeGraph } from "../graphs/01-outcome/outcomeGraph.js";
import { runEvaluationSummaryGraph } from "../graphs/02-evaluation/evaluationGraph.js";
import { runInsightExplorationGraph } from "../graphs/03-insightExploration/insightExplorationGraph.js";
import {
  GRAPH_NAME_DECISION,
  GRAPH_NAME_EVALUATION,
  GRAPH_NAME_INSIGHT_EXPLORATION,
  GRAPH_NAME_OUTCOME,
} from "../constants/graphNames.js";
import {
  ERROR_CODE_UNEXPECTED_ERROR,
  ERROR_CODE_UNKNOWN_ERROR,
} from "../constants/errorCodes.js";
import type { WorkflowEnvelope, WorkflowError } from "../types/cli.js";

export class WorkflowCommandError extends Error {
  readonly code: string;

  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function toEnvelope(args: {
  ok: boolean;
  command: string;
  run_id?: string | null;
  status?: Stage1RunStatus | null;
  /** Any JSON-serializable payload; normalized to envelope `data` at the CLI boundary. */
  data?: unknown;
  error?: WorkflowError | null;
}): WorkflowEnvelope {
  return {
    ok: args.ok,
    command: args.command,
    run_id: args.run_id ?? null,
    status: args.status ?? null,
    data: normalizeEnvelopeData(args.data),
    error: args.error ?? null,
  };
}

function normalizeEnvelopeData(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeStatus(status: unknown): Stage1RunStatus {
  if (STAGE1_RUN_STATUSES.includes(status as Stage1RunStatus)) {
    return status as Stage1RunStatus;
  }
  return "failed";
}

export const WORKFLOW_RESUME_HANDLERS: Stage1RuntimeResumeHandlers = {
  [GRAPH_NAME_DECISION]: (input) => {
    const symbol = typeof input.symbol === "string" ? input.symbol : "";
    return runDecisionGraph({ ...input, symbol, run_id: input.run_id });
  },
  [GRAPH_NAME_OUTCOME]: (input) => runDueOutcomeGraph(input),
  [GRAPH_NAME_EVALUATION]: (input) => runEvaluationSummaryGraph(input),
  [GRAPH_NAME_INSIGHT_EXPLORATION]: (input) => {
    const symbol = typeof input.symbol === "string" ? input.symbol : "";
    const window = typeof input.window === "string" ? input.window : "";
    return runInsightExplorationGraph({ ...input, symbol, window });
  },
};

export function printEnvelope(envelope: WorkflowEnvelope): void {
  console.log(JSON.stringify(envelope));
}

export function toErrorEnvelope(command: string, error: unknown): WorkflowEnvelope {
  if (error instanceof WorkflowCommandError) {
    return toEnvelope({
      ok: false,
      command,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }
  if (error instanceof Error) {
    return toEnvelope({
      ok: false,
      command,
      error: {
        code: ERROR_CODE_UNEXPECTED_ERROR,
        message: error.message,
      },
    });
  }
  return toEnvelope({
    ok: false,
    command,
    error: {
      code: ERROR_CODE_UNKNOWN_ERROR,
      message: "Unknown error",
      details: error,
    },
  });
}
