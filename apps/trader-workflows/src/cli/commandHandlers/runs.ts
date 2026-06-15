import { z } from "zod";

import {
  ERROR_CODE_RUN_ID_REQUIRED,
  ERROR_CODE_INVALID_STATUS,
} from "../../constants/errorCodes.js";
import { STAGE1_RUN_STATUSES } from "../../runtime/checkpointStore.js";
import {
  STAGE1_OBSERVABILITY_LIMIT_MAX,
  type Stage1Runtime,
} from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WORKFLOW_RESUME_HANDLERS, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

const stage1RunStatusSchema = z.enum(STAGE1_RUN_STATUSES, {
  errorMap: () => ({
    message: `status must be one of: ${STAGE1_RUN_STATUSES.join(", ")}`,
  }),
});

export const RunsListOpts = z.object({
  limit: z.coerce.number().int().positive().default(50),
});
export type RunsListOpts = z.infer<typeof RunsListOpts>;

export const RunsShowOpts = z.object({
  runId: z.string().min(1, ERROR_CODE_RUN_ID_REQUIRED),
});
export type RunsShowOpts = z.infer<typeof RunsShowOpts>;

export const RunsResumeOpts = z.object({
  runId: z.string().min(1, ERROR_CODE_RUN_ID_REQUIRED),
});
export type RunsResumeOpts = z.infer<typeof RunsResumeOpts>;

export const RunsMonitorOpts = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(50)
    .transform((value) => Math.min(value, STAGE1_OBSERVABILITY_LIMIT_MAX)),
  status: stage1RunStatusSchema.optional(),
  graphName: z.string().optional(),
});
export type RunsMonitorOpts = z.infer<typeof RunsMonitorOpts>;

export const RunsTraceOpts = z.object({
  runId: z.string().min(1, ERROR_CODE_RUN_ID_REQUIRED),
});
export type RunsTraceOpts = z.infer<typeof RunsTraceOpts>;

function parseMonitorOpts(raw: unknown): RunsMonitorOpts {
  try {
    return parseOpts(RunsMonitorOpts, raw);
  } catch (error) {
    if (
      error instanceof WorkflowCommandError &&
      error.message.includes("status must be one of")
    ) {
      throw new WorkflowCommandError(ERROR_CODE_INVALID_STATUS, error.message);
    }
    throw error;
  }
}

export async function handleRunsListCommandAsync(
  runtime: Stage1Runtime,
  opts: RunsListOpts,
): Promise<WorkflowEnvelope> {
  const runs = runtime.listRuns(opts.limit);
  return toEnvelope({
    ok: true,
    command: "runs list",
    data: { runs },
  });
}

export async function handleRunsShowCommandAsync(
  runtime: Stage1Runtime,
  opts: RunsShowOpts,
): Promise<WorkflowEnvelope> {
  const run = runtime.showRun(opts.runId);
  return toEnvelope({
    ok: true,
    command: "runs show",
    run_id: run.run_id,
    status: normalizeStatus(run.status),
    data: { run },
  });
}

export async function handleRunsResumeCommandAsync(
  runtime: Stage1Runtime,
  opts: RunsResumeOpts,
): Promise<WorkflowEnvelope> {
  const run = await runtime.resumeRun(opts.runId, WORKFLOW_RESUME_HANDLERS);
  return toEnvelope({
    ok: true,
    command: "runs resume",
    run_id: run.run_id,
    status: normalizeStatus(run.status),
    data: { run },
  });
}

export async function handleRunsMonitorCommandAsync(
  runtime: Stage1Runtime,
  opts: RunsMonitorOpts,
): Promise<WorkflowEnvelope> {
  const limit = Math.min(opts.limit, STAGE1_OBSERVABILITY_LIMIT_MAX);
  const runs = runtime.listRunMonitorSummaries({
    status: opts.status,
    graph_name: opts.graphName,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "runs monitor",
    data: {
      runs,
      count: runs.length,
      filters: {
        status: opts.status ?? null,
        graph_name: opts.graphName ?? null,
        limit,
      },
    },
  });
}

export async function handleRunsTraceCommandAsync(
  runtime: Stage1Runtime,
  opts: RunsTraceOpts,
): Promise<WorkflowEnvelope> {
  const detail = runtime.showRunTraceDetail(opts.runId);
  return toEnvelope({
    ok: true,
    command: "runs trace",
    run_id: detail.run.run_id,
    status: normalizeStatus(detail.run.status),
    data: {
      run: detail.run,
      checkpoints: detail.checkpoints,
      output_summary: detail.output_summary,
      resume_hint: detail.resume_hint,
    },
  });
}

/** Wire commander monitor actions through shared status error mapping. */
export function parseRunsMonitorOpts(raw: unknown): RunsMonitorOpts {
  return parseMonitorOpts(raw);
}
