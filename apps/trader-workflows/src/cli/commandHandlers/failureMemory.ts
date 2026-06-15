import { z } from "zod";

import { listFailureMemories } from "../../data/marketAgent.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope } from "../helpers.js";

export const FailureMemoryListOpts = z.object({
  symbol: z.string().optional(),
  failureType: z.string().optional(),
  setup: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type FailureMemoryListOpts = z.infer<typeof FailureMemoryListOpts>;

export async function handleFailureMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  opts: FailureMemoryListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listFailureMemories({
    symbol: opts.symbol?.toUpperCase(),
    failure_type: opts.failureType,
    setup: opts.setup,
    status: opts.status,
    limit: opts.limit,
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
