import { z } from "zod";

import { listModelDecisions } from "../../data/marketAgent.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope } from "../helpers.js";

export const DecisionsListOpts = z.object({
  symbol: z.string().optional(),
  modelVersion: z.string().optional(),
  limit: z.coerce.number().int().positive().default(500),
});
export type DecisionsListOpts = z.infer<typeof DecisionsListOpts>;

export async function handleDecisionsListCommandAsync(
  _runtime: Stage1Runtime,
  opts: DecisionsListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listModelDecisions({
    symbol: opts.symbol,
    model_version: opts.modelVersion,
    limit: opts.limit,
  });
  return toEnvelope({
    ok: true,
    command: "decisions list",
    data: {
      model_decisions: response.items,
      count: response.count,
    },
  });
}
