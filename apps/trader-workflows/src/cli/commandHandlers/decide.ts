import { z } from "zod";

import { runDecisionGraphViaRuntime } from "../../orchestration/graphRunner.js";
import {
  ERROR_CODE_GATE_JSON_INVALID,
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SYMBOL_REQUIRED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_DECISION } from "../../constants/graphNames.js";
import type { GateDecision } from "../../graphs/00-decision/decisionGraph.llmNodes.js";
import type { DecisionGraphInput } from "../../graphs/00-decision/decisionGraph.types.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

export const DecideOpts = z.object({
  symbol: z.string().min(1, ERROR_CODE_SYMBOL_REQUIRED),
  setup: z.string().default("default"),
  gateJson: z.string().optional(),
});
export type DecideOpts = z.infer<typeof DecideOpts>;

function parseGateDecision(gateJson: string | undefined): GateDecision | undefined {
  if (!gateJson) {
    return undefined;
  }
  try {
    return JSON.parse(gateJson) as GateDecision;
  } catch {
    throw new WorkflowCommandError(
      ERROR_CODE_GATE_JSON_INVALID,
      "decide --gate-json must be valid JSON",
    );
  }
}

export function parseDecideOpts(raw: unknown): DecideOpts {
  return parseOpts(DecideOpts, raw);
}

export async function handleDecideCommandAsync(
  runtime: Stage1Runtime,
  opts: DecideOpts,
): Promise<WorkflowEnvelope> {
  const input: DecisionGraphInput = {
    symbol: opts.symbol.toUpperCase(),
    setup_name: opts.setup,
  };

  const gateDecision = parseGateDecision(opts.gateJson);
  if (gateDecision) {
    input.gate_decision = gateDecision;
  }

  const executed = await runDecisionGraphViaRuntime(runtime, input);
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(
      ERROR_CODE_RUN_INTERRUPTED,
      `${GRAPH_NAME_DECISION} interrupted before completion`,
    );
  }
  return toEnvelope({
    ok: true,
    command: "decide",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      snapshot_id: result.snapshot.snapshot_id,
      decision_id: result.decision.decision_id,
      action: result.envelope.action,
      scheduled_outcome_count: result.scheduled_outcomes.length,
      paper_execution_submitted: result.paper_execution_submitted,
    },
  });
}
