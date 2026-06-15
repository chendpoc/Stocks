import { z } from "zod";

import {
  fetchMarketData,
  getMarketDataHealth,
  getMarketDataQuality,
} from "../../data/marketAgent.js";
import {
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

const optionalPositiveInt = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

export const MarketDataFetchOpts = z.object({
  symbol: z.string().min(1, ERROR_CODE_SYMBOL_REQUIRED),
  timeframe: z.string().default("1d"),
  limit: optionalPositiveInt,
  minRequired: optionalPositiveInt,
  allowLiveFallback: z.boolean().optional().default(false),
});
export type MarketDataFetchOpts = z.infer<typeof MarketDataFetchOpts>;

export const MarketDataHealthOpts = z.object({
  symbol: z.string().optional(),
});
export type MarketDataHealthOpts = z.infer<typeof MarketDataHealthOpts>;

export const MarketDataQualityOpts = z.object({
  symbol: z.string().min(1, ERROR_CODE_SYMBOL_REQUIRED),
  timeframe: z.string().default("1d"),
  limit: optionalPositiveInt,
  minRequired: optionalPositiveInt,
});
export type MarketDataQualityOpts = z.infer<typeof MarketDataQualityOpts>;

function parseSymbolRequiredOpts<T extends { symbol: string }>(
  schema: z.ZodType<T>,
  raw: unknown,
  message: string,
): T {
  try {
    return parseOpts(schema, raw);
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      if (
        error.code === "SYMBOL_INVALID" ||
        error.message.includes("symbol") ||
        error.code === ERROR_CODE_SYMBOL_REQUIRED
      ) {
        throw new WorkflowCommandError(ERROR_CODE_SYMBOL_REQUIRED, message);
      }
    }
    throw error;
  }
}

export function parseMarketDataFetchOpts(raw: unknown): MarketDataFetchOpts {
  return parseSymbolRequiredOpts(
    MarketDataFetchOpts,
    raw,
    "market-data fetch requires --symbol",
  );
}

export function parseMarketDataQualityOpts(raw: unknown): MarketDataQualityOpts {
  return parseSymbolRequiredOpts(
    MarketDataQualityOpts,
    raw,
    "market-data quality requires --symbol",
  );
}

export async function handleMarketDataFetchCommandAsync(
  _runtime: Stage1Runtime,
  opts: MarketDataFetchOpts,
): Promise<WorkflowEnvelope> {
  const response = await fetchMarketData({
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    limit: opts.limit,
    min_required: opts.minRequired,
    allow_live_fallback: opts.allowLiveFallback,
  });
  return toEnvelope({
    ok: true,
    command: "market-data fetch",
    data: response,
  });
}

export async function handleMarketDataHealthCommandAsync(
  _runtime: Stage1Runtime,
  opts: MarketDataHealthOpts,
): Promise<WorkflowEnvelope> {
  const response = await getMarketDataHealth({ symbol: opts.symbol?.toUpperCase() });
  return toEnvelope({
    ok: true,
    command: "market-data health",
    data: response,
  });
}

export async function handleMarketDataQualityCommandAsync(
  _runtime: Stage1Runtime,
  opts: MarketDataQualityOpts,
): Promise<WorkflowEnvelope> {
  const response = await getMarketDataQuality({
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    limit: opts.limit,
    min_required: opts.minRequired,
  });
  return toEnvelope({
    ok: true,
    command: "market-data quality",
    data: response,
  });
}

export async function handleMarketDataCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
    `Unknown market-data command: ${sub ?? "(missing)"} (use fetch|health|quality)`,
  );
}
