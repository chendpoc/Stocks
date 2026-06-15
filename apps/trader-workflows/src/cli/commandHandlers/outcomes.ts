import { listDecisionOutcomes } from "../../api/commands/decisions.js";
import { runOutcomeGraphViaRuntime } from "../../api/graphRunner.js";
import { CLI_FLAG_DUE, CLI_FLAG_LIMIT, CLI_FLAG_SYMBOL } from "../../constants/cliFlags.js";
import {
  ERROR_CODE_DUE_FLAG_REQUIRED,
  ERROR_CODE_INVALID_LIMIT,
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_OUTCOME } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  DEFAULT_OUTCOMES_LIST_LIMIT,
  parseOptionalFlagValue,
  parseOptionalOutcomeStatus,
  parsePositiveLimitFlag,
} from "../argParser.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleOutcomesListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const status = parseOptionalOutcomeStatus(args);
  const limit = parsePositiveLimitFlag(args, DEFAULT_OUTCOMES_LIST_LIMIT);
  const response = await listDecisionOutcomes({ symbol, status, limit });
  return toEnvelope({
    ok: true,
    command: "outcomes list",
    data: {
      outcomes: response.items,
      count: response.count,
    },
  });
}

export async function handleOutcomesRunCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "run" || !args.includes(CLI_FLAG_DUE)) {
    throw new WorkflowCommandError(
      ERROR_CODE_DUE_FLAG_REQUIRED,
      "outcomes run requires --due",
    );
  }

  const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
  const limitFlagIndex = args.indexOf(CLI_FLAG_LIMIT);
  const symbol =
    symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1]?.toUpperCase() : undefined;
  const limit =
    limitFlagIndex >= 0 ? Number.parseInt(args[limitFlagIndex + 1] ?? "", 10) : 100;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new WorkflowCommandError(ERROR_CODE_INVALID_LIMIT, "limit must be a positive integer");
  }

  const executed = await runOutcomeGraphViaRuntime(runtime, { symbol, limit });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_OUTCOME} interrupted before completion`);
  }
  return toEnvelope({
    ok: true,
    command: "outcomes run --due",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      processed_count: result.processed_count,
      labeled_count: result.labeled_count,
      skipped_count: result.skipped_count,
      failed_count: result.failed_count,
      counts_by_source_type: result.counts_by_source_type,
      counts_by_normalized_label: result.counts_by_normalized_label,
      outcomes: result.outcomes,
    },
  });
}

export async function handleOutcomesCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleOutcomesListCommandAsync(runtime, args);
  }
  if (sub === "run") {
    return handleOutcomesRunCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
    `Unknown outcomes command: ${sub ?? "(missing)"} (use list|run)`,
  );
}
