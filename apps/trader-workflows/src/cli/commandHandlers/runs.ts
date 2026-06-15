import {
  ERROR_CODE_RUN_ID_REQUIRED,
  ERROR_CODE_UNKNOWN_RUNS_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseLimit,
  parseOptionalGraphName,
  parseOptionalStatus,
  parseRunObservabilityLimit,
} from "../argParser.js";
import { normalizeStatus, toEnvelope, WORKFLOW_RESUME_HANDLERS, WorkflowCommandError } from "../helpers.js";

export async function handleRunsCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  switch (sub) {
    case "list": {
      const limit = parseLimit(args);
      const runs = runtime.listRuns(limit);
      return toEnvelope({
        ok: true,
        command: "runs list",
        data: { runs },
      });
    }
    case "show": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          ERROR_CODE_RUN_ID_REQUIRED,
          "runs show requires a run_id",
        );
      }
      const run = runtime.showRun(runId);
      return toEnvelope({
        ok: true,
        command: "runs show",
        run_id: run.run_id,
        status: normalizeStatus(run.status),
        data: { run },
      });
    }
    case "resume": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          ERROR_CODE_RUN_ID_REQUIRED,
          "runs resume requires a run_id",
        );
      }
      const run = await runtime.resumeRun(runId, WORKFLOW_RESUME_HANDLERS);
      return toEnvelope({
        ok: true,
        command: "runs resume",
        run_id: run.run_id,
        status: normalizeStatus(run.status),
        data: { run },
      });
    }
    case "monitor": {
      const limit = parseRunObservabilityLimit(args);
      const status = parseOptionalStatus(args);
      const graphName = parseOptionalGraphName(args);
      const runs = runtime.listRunMonitorSummaries({
        status,
        graph_name: graphName,
        limit,
      });
      return toEnvelope({
        ok: true,
        command: "runs monitor",
        data: {
          runs,
          count: runs.length,
          filters: {
            status: status ?? null,
            graph_name: graphName ?? null,
            limit,
          },
        },
      });
    }
    case "trace": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          ERROR_CODE_RUN_ID_REQUIRED,
          "runs trace requires a run_id",
        );
      }
      const detail = runtime.showRunTraceDetail(runId);
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
    default:
      throw new WorkflowCommandError(
        ERROR_CODE_UNKNOWN_RUNS_COMMAND,
        `Unknown runs command: ${sub ?? "(missing)"} (use list|show|resume|monitor|trace)`,
      );
  }
}
