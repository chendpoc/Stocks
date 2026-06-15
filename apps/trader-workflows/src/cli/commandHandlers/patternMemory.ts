import {
  degradePatternMemory,
  listPatternMemories,
  promotePatternMemory,
} from "../../data/marketAgent.js";
import {
  CLI_FLAG_LIMIT,
  CLI_FLAG_PATTERN_ID,
  CLI_FLAG_STATUS,
  CLI_FLAG_SYMBOL,
} from "../../constants/cliFlags.js";
import { ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND } from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseOptionalFlagValue,
  parsePatternMemoryDegradeInput,
  parsePatternMemoryPromoteInput,
  parsePositiveIntegerFlag,
} from "../argParser.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handlePatternMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const pattern_id = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_ID);
  const status = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 100);
  const response = await listPatternMemories({
    symbol: symbol?.toUpperCase(),
    pattern_id,
    status,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "pattern-memory list",
    data: {
      pattern_memories: response.items,
      count: response.count,
    },
  });
}

export async function handlePatternMemoryPromoteCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const input = parsePatternMemoryPromoteInput(args);
  const response = await promotePatternMemory({
    pattern_memory_id: input.pattern_memory_id,
    candidate_id: input.candidate_id,
    confirm: true,
  });
  return toEnvelope({
    ok: true,
    command: "pattern-memory promote",
    data: {
      pattern_memory: response.item,
    },
  });
}

export async function handlePatternMemoryDegradeCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const input = parsePatternMemoryDegradeInput(args);
  const response = await degradePatternMemory(input);
  return toEnvelope({
    ok: true,
    command: "pattern-memory degrade",
    data: {
      pattern_memory: response.item,
    },
  });
}

export async function handlePatternMemoryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handlePatternMemoryListCommandAsync(runtime, args);
  }
  if (sub === "promote") {
    return handlePatternMemoryPromoteCommandAsync(runtime, args);
  }
  if (sub === "degrade") {
    return handlePatternMemoryDegradeCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND,
    `Unknown pattern-memory command: ${sub ?? "(missing)"} (use list|promote|degrade)`,
  );
}
