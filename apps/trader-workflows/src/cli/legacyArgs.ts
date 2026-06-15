import {
  CLI_FLAG_ALLOW_LIVE_FALLBACK,
  CLI_FLAG_FAILURE_TYPE,
  CLI_FLAG_GRAPH_NAME,
  CLI_FLAG_LIMIT,
  CLI_FLAG_MAX_CHARS,
  CLI_FLAG_MIN_REQUIRED,
  CLI_FLAG_MODEL_VERSION,
  CLI_FLAG_OUTPUT,
  CLI_FLAG_PATTERN_ID,
  CLI_FLAG_PROFILE,
  CLI_FLAG_SESSION_ID,
  CLI_FLAG_SETUP,
  CLI_FLAG_STATUS,
  CLI_FLAG_SYMBOL,
  CLI_FLAG_TIMEFRAME,
  CLI_FLAG_TYPE,
  CLI_FLAG_VERIFICATION_STATUS,
} from "../constants/cliFlags.js";
import {
  ERROR_CODE_RUN_ID_REQUIRED,
  ERROR_CODE_SNAPSHOT_ID_REQUIRED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
  ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
  ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
  ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
  ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
  ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND,
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
  ContextBootstrapOpts,
  ContextLatestOpts,
  handleContextBootstrapAsync,
  handleContextLatestAsync,
  handleContextSnapshotsListCommandAsync,
  handleContextSnapshotsShowCommandAsync,
  parseContextSnapshotsListOpts,
  parseContextSnapshotsShowOpts,
} from "./commandHandlers/context.js";
import {
  handleInsightsListCommandAsync,
  InsightsListOpts,
} from "./commandHandlers/insights.js";
import {
  handleMarketDataFetchCommandAsync,
  handleMarketDataHealthCommandAsync,
  handleMarketDataQualityCommandAsync,
  MarketDataHealthOpts,
  parseMarketDataFetchOpts,
  parseMarketDataQualityOpts,
} from "./commandHandlers/marketData.js";
import {
  handleMemoryInitCommandAsync,
  MemoryInitOpts,
} from "./commandHandlers/memory.js";
import {
  handleOutcomesListCommandAsync,
  parseOutcomesListOpts,
} from "./commandHandlers/outcomes.js";
import {
  handlePatternMemoryListCommandAsync,
  PatternMemoryListOpts,
} from "./commandHandlers/patternMemory.js";
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

const S4_CONTEXT_SUBCOMMANDS = new Set(["bootstrap", "latest"]);
const S4_CONTEXT_SNAPSHOTS_SUBCOMMANDS = new Set(["list", "show"]);

export function isS4MigratedCommand(args: string[]): boolean {
  const top = args[0];
  const sub = args[1];
  if (top !== "context") {
    return false;
  }
  if (sub === "snapshots") {
    return S4_CONTEXT_SNAPSHOTS_SUBCOMMANDS.has(args[2] ?? "");
  }
  return S4_CONTEXT_SUBCOMMANDS.has(sub ?? "");
}

export async function dispatchS4CommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];

  if (sub === "bootstrap") {
    return handleContextBootstrapAsync(
      runtime,
      parseOpts(ContextBootstrapOpts, {
        sessionId: flagValue(args, CLI_FLAG_SESSION_ID, "SESSION_ID_VALUE_REQUIRED"),
        profile: flagValue(args, CLI_FLAG_PROFILE, "PROFILE_VALUE_REQUIRED"),
        symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
        maxChars: flagValue(args, CLI_FLAG_MAX_CHARS, "MAX_CHARS_VALUE_REQUIRED"),
        output: flagValue(args, CLI_FLAG_OUTPUT, "OUTPUT_VALUE_REQUIRED"),
      }),
    );
  }

  if (sub === "latest") {
    return handleContextLatestAsync(
      runtime,
      parseOpts(ContextLatestOpts, {
        sessionId: flagValue(args, CLI_FLAG_SESSION_ID, "SESSION_ID_VALUE_REQUIRED"),
        profile: flagValue(args, CLI_FLAG_PROFILE, "PROFILE_VALUE_REQUIRED"),
        symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
      }),
    );
  }

  if (sub === "snapshots") {
    const snapSub = args[2];
    switch (snapSub) {
      case "list": {
        if (!args.includes(CLI_FLAG_SYMBOL)) {
          throw new WorkflowCommandError(
            ERROR_CODE_SYMBOL_REQUIRED,
            "context snapshots list requires --symbol",
          );
        }
        return handleContextSnapshotsListCommandAsync(
          runtime,
          parseContextSnapshotsListOpts({
            symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
            limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
          }),
        );
      }
      case "show": {
        const snapshotId = args[3];
        if (!snapshotId || isFlagValue(snapshotId)) {
          throw new WorkflowCommandError(
            ERROR_CODE_SNAPSHOT_ID_REQUIRED,
            "context snapshots show requires a snapshot_id",
          );
        }
        return handleContextSnapshotsShowCommandAsync(
          runtime,
          parseContextSnapshotsShowOpts({ snapshotId }),
        );
      }
      default:
        throw new WorkflowCommandError(
          ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
          `Unknown context snapshots command: ${snapSub ?? "(missing)"} (use list|show)`,
        );
    }
  }

  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
    `Unknown context command: ${sub ?? "(missing)"} (use snapshots|bootstrap|latest)`,
  );
}

const S3_MARKET_DATA_SUBCOMMANDS = new Set(["fetch", "health", "quality"]);
const S3_PARTIAL_COMMANDS: Record<string, Set<string>> = {
  outcomes: new Set(["list"]),
  insights: new Set(["list"]),
  "pattern-memory": new Set(["list"]),
};

export function isS3MigratedCommand(args: string[]): boolean {
  const top = args[0];
  const sub = args[1];
  if (top === "market-data" && sub && S3_MARKET_DATA_SUBCOMMANDS.has(sub)) {
    return true;
  }
  const subs = S3_PARTIAL_COMMANDS[top];
  return subs?.has(sub ?? "") ?? false;
}

export async function dispatchS3CommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const top = args[0];
  const sub = args[1];

  if (top === "outcomes") {
    if (sub === "list") {
      return handleOutcomesListCommandAsync(
        runtime,
        parseOutcomesListOpts({
          symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          status: flagValue(args, CLI_FLAG_STATUS, "STATUS_VALUE_REQUIRED"),
          limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
        }),
      );
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
      `Unknown outcomes command: ${sub ?? "(missing)"} (use list|run)`,
    );
  }

  if (top === "insights") {
    if (sub === "list") {
      return handleInsightsListCommandAsync(
        runtime,
        parseOpts(InsightsListOpts, {
          symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          verificationStatus: flagValue(
            args,
            CLI_FLAG_VERIFICATION_STATUS,
            "VERIFICATION_STATUS_VALUE_REQUIRED",
          ),
          limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
        }),
      );
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
      `Unknown insights command: ${sub ?? "(missing)"} (use explore|list)`,
    );
  }

  if (top === "pattern-memory") {
    if (sub === "list") {
      return handlePatternMemoryListCommandAsync(
        runtime,
        parseOpts(PatternMemoryListOpts, {
          symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          patternId: flagValue(args, CLI_FLAG_PATTERN_ID, "PATTERN_ID_VALUE_REQUIRED"),
          status: flagValue(args, CLI_FLAG_STATUS, "STATUS_VALUE_REQUIRED"),
          limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
        }),
      );
    }
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND,
      `Unknown pattern-memory command: ${sub ?? "(missing)"} (use list|promote|degrade)`,
    );
  }

  if (top === "market-data") {
    switch (sub) {
      case "fetch": {
        if (!args.includes(CLI_FLAG_SYMBOL)) {
          throw new WorkflowCommandError(
            ERROR_CODE_SYMBOL_REQUIRED,
            "market-data fetch requires --symbol",
          );
        }
        return handleMarketDataFetchCommandAsync(
          runtime,
          parseMarketDataFetchOpts({
            symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
            timeframe: flagValue(args, CLI_FLAG_TIMEFRAME, "TIMEFRAME_VALUE_REQUIRED"),
            limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
            minRequired: flagValue(args, CLI_FLAG_MIN_REQUIRED, "MIN_REQUIRED_VALUE_REQUIRED"),
            allowLiveFallback: args.includes(CLI_FLAG_ALLOW_LIVE_FALLBACK),
          }),
        );
      }
      case "health":
        return handleMarketDataHealthCommandAsync(
          runtime,
          parseOpts(MarketDataHealthOpts, {
            symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
          }),
        );
      case "quality": {
        if (!args.includes(CLI_FLAG_SYMBOL)) {
          throw new WorkflowCommandError(
            ERROR_CODE_SYMBOL_REQUIRED,
            "market-data quality requires --symbol",
          );
        }
        return handleMarketDataQualityCommandAsync(
          runtime,
          parseMarketDataQualityOpts({
            symbol: flagValue(args, CLI_FLAG_SYMBOL, "SYMBOL_VALUE_REQUIRED"),
            timeframe: flagValue(args, CLI_FLAG_TIMEFRAME, "TIMEFRAME_VALUE_REQUIRED"),
            limit: flagValue(args, CLI_FLAG_LIMIT, "LIMIT_VALUE_REQUIRED"),
            minRequired: flagValue(args, CLI_FLAG_MIN_REQUIRED, "MIN_REQUIRED_VALUE_REQUIRED"),
          }),
        );
      }
      default:
        throw new WorkflowCommandError(
          ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
          `Unknown market-data command: ${sub ?? "(missing)"} (use fetch|health|quality)`,
        );
    }
  }

  throw new WorkflowCommandError(
    "INTERNAL_ERROR",
    `dispatchS3CommandAsync called for non-S3 command: ${top} ${sub ?? ""}`,
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
