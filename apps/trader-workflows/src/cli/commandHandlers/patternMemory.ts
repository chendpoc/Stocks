import { z } from "zod";

import {
  degradePatternMemory,
  listPatternMemories,
  promotePatternMemory,
} from "../../data/marketAgent.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";
import {
  type PatternMemoryDegradeInput,
  type PatternMemoryPromoteInput,
  validatePatternMemoryDegradeInput,
  validatePatternMemoryPromoteInput,
} from "../validators.js";

export const PatternMemoryListOpts = z.object({
  symbol: z.string().optional(),
  patternId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type PatternMemoryListOpts = z.infer<typeof PatternMemoryListOpts>;

export const PatternMemoryPromoteOpts = z.object({
  confirm: z.boolean().optional(),
  patternMemoryId: z.string().optional(),
  candidateId: z.string().optional(),
});
export type PatternMemoryPromoteOpts = z.infer<typeof PatternMemoryPromoteOpts>;

export const PatternMemoryDegradeOpts = z.object({
  patternMemoryId: z.string().optional(),
  patternId: z.string().optional(),
  reason: z.string().optional(),
});
export type PatternMemoryDegradeOpts = z.infer<typeof PatternMemoryDegradeOpts>;

export function parsePatternMemoryPromoteOpts(raw: unknown): PatternMemoryPromoteInput {
  return validatePatternMemoryPromoteInput(parseOpts(PatternMemoryPromoteOpts, raw));
}

export function parsePatternMemoryDegradeOpts(raw: unknown): PatternMemoryDegradeInput {
  return validatePatternMemoryDegradeInput(parseOpts(PatternMemoryDegradeOpts, raw));
}

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
  input: PatternMemoryPromoteInput,
): Promise<WorkflowEnvelope> {
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
  input: PatternMemoryDegradeInput,
): Promise<WorkflowEnvelope> {
  const response = await degradePatternMemory(input);
  return toEnvelope({
    ok: true,
    command: "pattern-memory degrade",
    data: {
      pattern_memory: response.item,
    },
  });
}
