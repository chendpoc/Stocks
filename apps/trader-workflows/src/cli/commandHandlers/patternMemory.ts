import { z } from "zod";

import {
  degradePatternMemory,
  listPatternMemories,
  promotePatternMemory,
} from "../../data/marketAgent.js";
import { ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND } from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parsePatternMemoryDegradeInput,
  parsePatternMemoryPromoteInput,
} from "../flagParsing.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export const PatternMemoryListOpts = z.object({
  symbol: z.string().optional(),
  patternId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type PatternMemoryListOpts = z.infer<typeof PatternMemoryListOpts>;

export async function handlePatternMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  opts: PatternMemoryListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listPatternMemories({
    symbol: opts.symbol?.toUpperCase(),
    pattern_id: opts.patternId,
    status: opts.status,
    limit: opts.limit,
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
