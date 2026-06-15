import { z } from "zod";

import { initMarketAgentMemory } from "../../data/marketAgent.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope } from "../helpers.js";

export const MemoryInitOpts = z.object({});
export type MemoryInitOpts = z.infer<typeof MemoryInitOpts>;

export async function handleMemoryInitCommandAsync(
  _runtime: Stage1Runtime,
  _opts: MemoryInitOpts,
): Promise<WorkflowEnvelope> {
  const response = await initMarketAgentMemory();
  return toEnvelope({
    ok: true,
    command: "memory init",
    data: response,
  });
}
