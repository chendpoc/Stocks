import { z } from "zod";

import { runEvaluationGraphViaRuntime } from "../../orchestration/graphRunner.js";
import { ERROR_CODE_RUN_INTERRUPTED } from "../../constants/errorCodes.js";
import { GRAPH_NAME_EVALUATION } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

export const EvalSummaryOpts = z.object({
  symbol: z.string().optional(),
  modelVersion: z.string().default("stage1-v0"),
  limit: z.coerce.number().int().positive().default(500),
});
export type EvalSummaryOpts = z.infer<typeof EvalSummaryOpts>;

export function parseEvalSummaryOpts(raw: unknown): EvalSummaryOpts {
  return parseOpts(EvalSummaryOpts, raw);
}

export async function handleEvalSummaryCommandAsync(
  runtime: Stage1Runtime,
  opts: EvalSummaryOpts,
): Promise<WorkflowEnvelope> {
  const executed = await runEvaluationGraphViaRuntime(runtime, {
    symbol: opts.symbol?.toUpperCase(),
    model_version: opts.modelVersion,
    limit: opts.limit,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(
      ERROR_CODE_RUN_INTERRUPTED,
      `${GRAPH_NAME_EVALUATION} interrupted before completion`,
    );
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
