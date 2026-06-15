import { runDecisionGraphViaRuntime } from "../../api/graphRunner.js";
import { CLI_FLAG_GATE_JSON, CLI_FLAG_SETUP } from "../../constants/cliFlags.js";
import {
  ERROR_CODE_GATE_JSON_INVALID,
  ERROR_CODE_GATE_JSON_REQUIRED,
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SYMBOL_REQUIRED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_DECISION } from "../../constants/graphNames.js";
import type { GateDecision } from "../../graphs/00-decision/decisionGraph.llmNodes.js";
import type { DecisionGraphInput } from "../../graphs/00-decision/decisionGraph.types.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleDecideCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = args[1];
  if (!symbol) {
    throw new WorkflowCommandError(
      ERROR_CODE_SYMBOL_REQUIRED,
      "decide requires a symbol argument",
    );
  }

  const input: DecisionGraphInput = { symbol: symbol.toUpperCase() };

  const setupFlagIndex = args.indexOf(CLI_FLAG_SETUP);
  if (setupFlagIndex >= 0) {
    const setupName = args[setupFlagIndex + 1];
    if (setupName) {
      input.setup_name = setupName;
    }
  }

  const gateFlagIndex = args.indexOf(CLI_FLAG_GATE_JSON);
  if (gateFlagIndex >= 0) {
    const gateRaw = args[gateFlagIndex + 1];
    if (!gateRaw) {
      throw new WorkflowCommandError(
        ERROR_CODE_GATE_JSON_REQUIRED,
        "decide --gate-json requires a JSON payload",
      );
    }
    try {
      input.gate_decision = JSON.parse(gateRaw) as GateDecision;
    } catch {
      throw new WorkflowCommandError(
        ERROR_CODE_GATE_JSON_INVALID,
        "decide --gate-json must be valid JSON",
      );
    }
  }

  const executed = await runDecisionGraphViaRuntime(runtime, input);
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_DECISION} interrupted before completion`);
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
