import {
  ERROR_CODE_COMMAND_REQUIRED,
  ERROR_CODE_UNKNOWN_COMMAND,
} from "../constants/errorCodes.js";
import type { Stage1Runtime } from "../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import { handleContextCommandAsync } from "./commandHandlers/context.js";
import { handleDecideCommandAsync } from "./commandHandlers/decide.js";
import { handleEvalSummaryCommandAsync } from "./commandHandlers/eval.js";
import { handleInsightsCommandAsync } from "./commandHandlers/insights.js";
import { handleMarketMonitorRunCommandAsync } from "./commandHandlers/marketMonitor.js";
import { handleOutcomesCommandAsync } from "./commandHandlers/outcomes.js";
import { handlePatternMemoryCommandAsync } from "./commandHandlers/patternMemory.js";
import { WorkflowCommandError } from "./helpers.js";
import {
  dispatchS2CommandAsync,
  dispatchS3CommandAsync,
  isS2MigratedTopLevelCommand,
  isS3MigratedCommand,
} from "./legacyArgs.js";
import {
  isCommanderUnknownCommandError,
  stripJsonFlag,
  validateTopLevelCommand,
} from "./program.js";

export type HandlerFn = (
  runtime: Stage1Runtime,
  args: string[],
) => Promise<WorkflowEnvelope>;

const SUPPORTED_COMMANDS =
  "memory, runs, decide, decisions, context, outcomes, eval, insights, pattern-memory, failure-memory, market-monitor, market-data";

/** S4+ commands still on legacy string[] handlers. */
const LEGACY_COMMAND_HANDLERS: Record<string, HandlerFn> = {
  decide: handleDecideCommandAsync,
  outcomes: handleOutcomesCommandAsync,
  eval: handleEvalSummaryCommandAsync,
  insights: handleInsightsCommandAsync,
  context: handleContextCommandAsync,
  "market-monitor": handleMarketMonitorRunCommandAsync,
  "pattern-memory": handlePatternMemoryCommandAsync,
};

export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const commandArgs = stripJsonFlag(args);

  if (commandArgs.length === 0) {
    throw new WorkflowCommandError(
      ERROR_CODE_COMMAND_REQUIRED,
      "Command required (expected: memory init | runs list|show|resume|monitor|trace | decide SYMBOL | decisions list | context snapshots list|show | context bootstrap|latest | outcomes run --due|list | eval summary | insights explore|list | pattern-memory list|promote|degrade | failure-memory list | market-monitor run | market-data fetch|health|quality)",
    );
  }

  try {
    await validateTopLevelCommand(args);
  } catch (error) {
    if (isCommanderUnknownCommandError(error)) {
      throw new WorkflowCommandError(
        ERROR_CODE_UNKNOWN_COMMAND,
        `Unknown command: ${commandArgs[0]} (currently supported: ${SUPPORTED_COMMANDS})`,
      );
    }
    throw error;
  }

  const top = commandArgs[0];
  if (isS2MigratedTopLevelCommand(top)) {
    return dispatchS2CommandAsync(runtime, commandArgs);
  }

  if (isS3MigratedCommand(commandArgs)) {
    return dispatchS3CommandAsync(runtime, commandArgs);
  }

  const handler = LEGACY_COMMAND_HANDLERS[top];
  if (!handler) {
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_COMMAND,
      `Unknown command: ${top} (currently supported: ${SUPPORTED_COMMANDS})`,
    );
  }

  return handler(runtime, commandArgs);
}
