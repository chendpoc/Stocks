import { listInsightCandidates } from "../../api/commands/marketAgent.js";
import { runInsightExplorationGraphViaRuntime } from "../../api/graphRunner.js";
import { CLI_FLAG_SYMBOL, CLI_FLAG_VERIFICATION_STATUS, CLI_FLAG_WINDOW } from "../../constants/cliFlags.js";
import {
  ERROR_CODE_EXPLORE_SUBCOMMAND_REQUIRED,
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
  ERROR_CODE_WINDOW_REQUIRED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_INSIGHT_EXPLORATION } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  DEFAULT_INSIGHTS_LIST_LIMIT,
  parseOptionalFlagValue,
  parsePositiveLimitFlag,
} from "../argParser.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleInsightsExploreCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "explore") {
    throw new WorkflowCommandError(
      ERROR_CODE_EXPLORE_SUBCOMMAND_REQUIRED,
      "insights requires explore subcommand",
    );
  }

  const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
  const windowFlagIndex = args.indexOf(CLI_FLAG_WINDOW);
  const symbol = args[symbolFlagIndex + 1]?.toUpperCase();
  const window = args[windowFlagIndex + 1];
  if (!symbol) {
    throw new WorkflowCommandError(ERROR_CODE_SYMBOL_REQUIRED, `insights explore requires ${CLI_FLAG_SYMBOL}`);
  }
  if (!window) {
    throw new WorkflowCommandError(ERROR_CODE_WINDOW_REQUIRED, `insights explore requires ${CLI_FLAG_WINDOW}`);
  }

  const executed = await runInsightExplorationGraphViaRuntime(runtime, {
    symbol,
    window,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_INSIGHT_EXPLORATION} interrupted before completion`);
  }
  return toEnvelope({
    ok: true,
    command: "insights explore",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      insight_id: result.insight_id,
      window: result.window.window,
      window_start: result.window.window_start,
      window_end: result.window.window_end,
      react_step_count: result.react_steps.length,
      verification_status: result.persisted_candidate?.verification_status ?? "pending",
      weight_cap: result.proposal.weight_cap,
      evidence_ref_count: result.proposal.evidence_refs.length,
      thesis: result.proposal.thesis,
      persisted_candidate: result.persisted_candidate,
      scheduled_outcome_id: result.scheduled_outcome?.outcome_id ?? null,
      scheduled_outcome_horizon: result.scheduled_outcome?.horizon ?? null,
    },
  });
}

export async function handleInsightsListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const verification_status = parseOptionalFlagValue(args, CLI_FLAG_VERIFICATION_STATUS);
  const limit = parsePositiveLimitFlag(args, DEFAULT_INSIGHTS_LIST_LIMIT);
  const response = await listInsightCandidates({ symbol, verification_status, limit });
  return toEnvelope({
    ok: true,
    command: "insights list",
    data: {
      insight_candidates: response.items,
      count: response.count,
    },
  });
}

export async function handleInsightsCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "explore") {
    return handleInsightsExploreCommandAsync(runtime, args);
  }
  if (sub === "list") {
    return handleInsightsListCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
    `Unknown insights command: ${sub ?? "(missing)"} (use explore|list)`,
  );
}
