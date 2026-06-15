import {
  CLI_FLAG_FAILURE_TYPE,
  CLI_FLAG_GRAPH_NAME,
  CLI_FLAG_LIMIT,
  CLI_FLAG_MODEL_VERSION,
  CLI_FLAG_SETUP,
  CLI_FLAG_STATUS,
  CLI_FLAG_SYMBOL,
  CLI_FLAG_TYPE,
} from "../constants/cliFlags.js";
import {
  ERROR_CODE_RUN_ID_REQUIRED,
  ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
  ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_RUNS_COMMAND,
} from "../constants/errorCodes.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import {
  DecisionsListOpts,
  handleDecisionsListCommandAsync,
} from "./commandHandlers/decisions.js";
import {
  FailureMemoryListOpts,
  handleFailureMemoryListCommandAsync,
} from "./commandHandlers/failureMemory.js";
import {
  handleMemoryInitCommandAsync,
  MemoryInitOpts,
} from "./commandHandlers/memory.js";
import {
  handleRunsListCommandAsync,
  handleRunsMonitorCommandAsync,
  handleRunsResumeCommandAsync,
  handleRunsShowCommandAsync,
  handleRunsTraceCommandAsync,
  RunsListOpts,
  RunsMonitorOpts,
  RunsResumeOpts,
  RunsShowOpts,
  RunsTraceOpts,
} from "./commandHandlers/runs.js";
import { WorkflowCommandError } from "./helpers.js";
import { parseOpts } from "./parseOpts.js";
import type { Stage1Runtime } from "../runtime/stage1Runtime.js";

function isFlagValue(value: string): boolean {
  return value.startsWith("--");
}

function flagValue(args: string[], flag: string, valueRequiredCode: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex < 0) {
    return undefined;
  }
  const raw = args[flagIndex + 1];
  if (!raw || isFlagValue(raw)) {
    throw new WorkflowCommandError(
      valueRequiredCode,
      `${flag} requires a value`,
    );
  }
  return raw;
}

function optionalFailureType(args: string[]): string | undefined {
  return (
    flagValue(args, CLI_FLAG_TYPE, "TYPE_VALUE_REQUIRED") ??
    flagValue(args, CLI_FLAG_FAILURE_TYPE, "FAILURE_TYPE_VALUE_REQUIRED")
  );
}

const S2_TOP_LEVEL_COMMANDS = new Set([
  "memory",
  "runs",
  "decisions",
  "failure-memory",
]);

export function isS2MigratedTopLevelCommand(command: string): boolean {
  return S2_TOP_LEVEL_COMMANDS.has(command);
}

export async function dispatchS2CommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const top = args[0];

  if (top === "memory") {
    const sub = args[1];
    if (sub === "init") {
      return handleMemoryInitCommandAsync(runtime, parseOpts(MemoryInitOpts, {}));
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
      `Unknown memory command: ${sub ?? "(missing)"} (use init)`,
    );
  }

  if (top === "runs") {
    const sub = args[1];
    switch (sub) {
      case "list":
        return handleRunsListCommandAsync(
          runtime,
          parseOpts(RunsListOpts, {
            limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
          }),
        );
      case "show": {
        const runId = args[2];
        if (!runId || isFlagValue(runId)) {
          throw new WorkflowCommandError(
            ERROR_CODE_RUN_ID_REQUIRED,
            "runs show requires a run_id",
          );
        }
        return handleRunsShowCommandAsync(runtime, parseOpts(RunsShowOpts, { runId }));
      }
      case "resume": {
        const runId = args[2];
        if (!runId || isFlagValue(runId)) {
          throw new WorkflowCommandError(
            ERROR_CODE_RUN_ID_REQUIRED,
            "runs resume requires a run_id",
          );
        }
        return handleRunsResumeCommandAsync(runtime, parseOpts(RunsResumeOpts, { runId }));
      }
      case "monitor":
        return handleRunsMonitorCommandAsync(
          runtime,
          parseOpts(RunsMonitorOpts, {
            limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
            status: flagValue(args, CLI_FLAG_STATUS, "STATUS_VALUE_REQUIRED"),
            graphName: flagValue(args, CLI_FLAG_GRAPH_NAME, "GRAPH_NAME_VALUE_REQUIRED"),
          }),
        );
      case "trace": {
        const runId = args[2];
        if (!runId || isFlagValue(runId)) {
          throw new WorkflowCommandError(
            ERROR_CODE_RUN_ID_REQUIRED,
            "runs trace requires a run_id",
          );
        }
        return handleRunsTraceCommandAsync(runtime, parseOpts(RunsTraceOpts, { runId }));
      }
      default:
        throw new WorkflowCommandError(
          ERROR_CODE_UNKNOWN_RUNS_COMMAND,
          `Unknown runs command: ${sub ?? "(missing)"} (use list|show|resume|monitor|trace)`,
        );
    }
  }

  if (top === "decisions") {
    const sub = args[1];
    if (sub === "list") {
      return handleDecisionsListCommandAsync(
        runtime,
        parseOpts(DecisionsListOpts, {
          symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          modelVersion: flagValue(args, CLI_FLAG_MODEL_VERSION, "MODEL_VERSION_VALUE_REQUIRED"),
          limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
        }),
      );
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
      `Unknown decisions command: ${sub ?? "(missing)"} (use list)`,
    );
  }

  if (top === "failure-memory") {
    const sub = args[1];
    if (sub === "list") {
      return handleFailureMemoryListCommandAsync(
        runtime,
        parseOpts(FailureMemoryListOpts, {
          symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          failureType: optionalFailureType(args),
          setup: flagValue(args, CLI_FLAG_SETUP, "SETUP_VALUE_REQUIRED"),
          status: flagValue(args, CLI_FLAG_STATUS, "STATUS_VALUE_REQUIRED"),
          limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
        }),
      );
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
      `Unknown failure-memory command: ${sub ?? "(missing)"} (use list)`,
    );
  }

  throw new WorkflowCommandError(
    "INTERNAL_ERROR",
    `dispatchS2CommandAsync called for non-S2 command: ${top}`,
  );
}
