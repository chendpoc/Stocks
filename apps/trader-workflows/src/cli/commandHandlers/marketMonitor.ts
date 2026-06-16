import { z } from "zod";

import { runMarketMonitor } from "../../data/marketAgent.js";
import {
  ERROR_CODE_SYMBOLS_REQUIRED,
  ERROR_CODE_TIMEFRAMES_REQUIRED,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";
import { parseCsv } from "../../utils/string.js";

const optionalPositiveInt = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

export const MarketMonitorRunOpts = z.object({
  symbols: z
    .string()
    .min(1, ERROR_CODE_SYMBOLS_REQUIRED)
    .transform((value) => parseCsv(value).map((symbol) => symbol.toUpperCase())),
  timeframes: z
    .string()
    .min(1, ERROR_CODE_TIMEFRAMES_REQUIRED)
    .transform(parseCsv),
  limit: optionalPositiveInt,
  minRequired: optionalPositiveInt,
  allowLiveFallback: z.boolean().optional().default(false),
});
export type MarketMonitorRunOpts = z.infer<typeof MarketMonitorRunOpts>;

export function parseMarketMonitorRunOpts(raw: unknown): MarketMonitorRunOpts {
  const record = (raw ?? {}) as Record<string, unknown>;
  if (typeof record.symbols === "string" && record.symbols.startsWith("--")) {
    throw new WorkflowCommandError(
      "SYMBOLS_VALUE_REQUIRED",
      "--symbols requires a value",
    );
  }
  if (typeof record.timeframes === "string" && record.timeframes.startsWith("--")) {
    throw new WorkflowCommandError(
      "TIMEFRAMES_VALUE_REQUIRED",
      "--timeframes requires a value",
    );
  }
  if (record.symbols === undefined || record.symbols === "") {
    throw new WorkflowCommandError(
      ERROR_CODE_SYMBOLS_REQUIRED,
      "market-monitor run requires --symbols",
    );
  }
  if (record.timeframes === undefined || record.timeframes === "") {
    throw new WorkflowCommandError(
      ERROR_CODE_TIMEFRAMES_REQUIRED,
      "market-monitor run requires --timeframes",
    );
  }
  return parseOpts(MarketMonitorRunOpts, raw);
}

export async function handleMarketMonitorRunCommandAsync(
  _runtime: Stage1Runtime,
  opts: MarketMonitorRunOpts,
): Promise<WorkflowEnvelope> {
  const response = await runMarketMonitor({
    symbols: opts.symbols,
    timeframes: opts.timeframes,
    limit: opts.limit,
    min_required: opts.minRequired,
    allow_live_fallback: opts.allowLiveFallback,
  });
  return toEnvelope({
    ok: true,
    command: "market-monitor run",
    data: response,
  });
}
