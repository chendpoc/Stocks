import { listFailureMemories } from "../../services/marketAgent.js";
import {
  CLI_FLAG_LIMIT,
  CLI_FLAG_SETUP,
  CLI_FLAG_STATUS,
  CLI_FLAG_SYMBOL,
} from "../../constants/cliFlags.js";
import { ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND } from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseOptionalFailureType,
  parseOptionalFlagValue,
  parsePositiveIntegerFlag,
} from "../argParser.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleFailureMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const failureType = parseOptionalFailureType(args);
  const setup = parseOptionalFlagValue(args, CLI_FLAG_SETUP);
  const status = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 100);
  const response = await listFailureMemories({
    symbol: symbol?.toUpperCase(),
    failure_type: failureType,
    setup,
    status,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "failure-memory list",
    data: {
      failure_memories: response.items,
      count: response.count,
    },
  });
}

export async function handleFailureMemoryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleFailureMemoryListCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
    `Unknown failure-memory command: ${sub ?? "(missing)"} (use list)`,
  );
}
