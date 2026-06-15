import {
  ERROR_CODE_COMMAND_REQUIRED,
  ERROR_CODE_UNKNOWN_COMMAND,
} from "../constants/errorCodes.js";
import type { Stage1Runtime } from "../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import { WorkflowCommandError } from "./helpers.js";
import {
  dispatchS2CommandAsync,
  dispatchS3CommandAsync,
  dispatchS4CommandAsync,
  dispatchS5CommandAsync,
  dispatchS6CommandAsync,
  isS2MigratedTopLevelCommand,
  isS3MigratedCommand,
  isS4MigratedCommand,
  isS5MigratedCommand,
  isS6MigratedCommand,
} from "./legacyArgs.js";
import {
  isCommanderUnknownCommandError,
  stripJsonFlag,
  validateTopLevelCommand,
} from "./program.js";

const SUPPORTED_COMMANDS =
  "memory, runs, decide, decisions, context, outcomes, eval, insights, pattern-memory, failure-memory, market-monitor, market-data";

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

  if (isS4MigratedCommand(commandArgs)) {
    return dispatchS4CommandAsync(runtime, commandArgs);
  }

  if (isS5MigratedCommand(commandArgs)) {
    return dispatchS5CommandAsync(runtime, commandArgs);
  }

  if (isS6MigratedCommand(commandArgs)) {
    return dispatchS6CommandAsync(runtime, commandArgs);
  }

  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_COMMAND,
    `Unknown command: ${top} (currently supported: ${SUPPORTED_COMMANDS})`,
  );
}
