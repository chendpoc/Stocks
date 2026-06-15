import { runEvaluationGraphViaRuntime } from "../../orchestration/graphRunner.js";
import { parseOptionalFlagValue, parsePositiveIntegerFlag } from "../flagParsing.js";
import { CLI_FLAG_LIMIT, CLI_FLAG_MODEL_VERSION, CLI_FLAG_SYMBOL } from "../../constants/cliFlags.js";
import {
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SUMMARY_SUBCOMMAND_REQUIRED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_EVALUATION } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleEvalSummaryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "summary") {
    throw new WorkflowCommandError(
      ERROR_CODE_SUMMARY_SUBCOMMAND_REQUIRED,
      "eval requires summary subcommand",
    );
  }

  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL)?.toUpperCase() ?? undefined;
  const model_version = parseOptionalFlagValue(args, CLI_FLAG_MODEL_VERSION) ?? "stage1-v0";
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 500);

  const executed = await runEvaluationGraphViaRuntime(runtime, {
    symbol,
    model_version,
    limit,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_EVALUATION} interrupted before completion`);
  }

  return toEnvelope({
    ok: true,
    command: "eval summary",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      report_id: result.report.report_id,
      model_version: result.report.model_version,
      window_start: result.report.window_start,
      window_end: result.report.window_end,
      recommendation: result.report.recommendation,
      metrics_json: result.report.metrics_json,
      sections: result.report.sections,
      report_json: result.report.report_json,
      persisted_report: result.persisted_report,
    },
  });
}
