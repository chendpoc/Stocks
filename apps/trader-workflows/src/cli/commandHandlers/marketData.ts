import {
  fetchMarketData,
  getMarketDataHealth,
  getMarketDataQuality,
} from "../../data/marketAgent.js";
import {
  CLI_FLAG_ALLOW_LIVE_FALLBACK,
  CLI_FLAG_LIMIT,
  CLI_FLAG_MIN_REQUIRED,
  CLI_FLAG_SYMBOL,
  CLI_FLAG_TIMEFRAME,
} from "../../constants/cliFlags.js";
import {
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseOptionalBooleanFlag,
  parseOptionalFlagValue,
  parseOptionalIntFlag,
  parseRequiredFlagValue,
} from "../argParser.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleMarketDataFetchCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseRequiredFlagValue(
    args,
    CLI_FLAG_SYMBOL,
    ERROR_CODE_SYMBOL_REQUIRED,
    "market-data fetch requires --symbol",
  );
  const timeframe = parseOptionalFlagValue(args, CLI_FLAG_TIMEFRAME) ?? "1d";
  const limit = parseOptionalIntFlag(args, CLI_FLAG_LIMIT);
  const minRequired = parseOptionalIntFlag(args, CLI_FLAG_MIN_REQUIRED);
  const allowLiveFallback = parseOptionalBooleanFlag(args, CLI_FLAG_ALLOW_LIVE_FALLBACK);

  const response = await fetchMarketData({
    symbol,
    timeframe,
    limit,
    min_required: minRequired,
    allow_live_fallback: allowLiveFallback,
  });
  return toEnvelope({
    ok: true,
    command: "market-data fetch",
    data: response,
  });
}

export async function handleMarketDataHealthCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const response = await getMarketDataHealth({ symbol: symbol?.toUpperCase() });
  return toEnvelope({
    ok: true,
    command: "market-data health",
    data: response,
  });
}

export async function handleMarketDataQualityCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseRequiredFlagValue(
    args,
    CLI_FLAG_SYMBOL,
    ERROR_CODE_SYMBOL_REQUIRED,
    "market-data quality requires --symbol",
  );
  const timeframe = parseOptionalFlagValue(args, CLI_FLAG_TIMEFRAME) ?? "1d";
  const limit = parseOptionalIntFlag(args, CLI_FLAG_LIMIT);
  const minRequired = parseOptionalIntFlag(args, CLI_FLAG_MIN_REQUIRED);
  const response = await getMarketDataQuality({
    symbol,
    timeframe,
    limit,
    min_required: minRequired,
  });
  return toEnvelope({
    ok: true,
    command: "market-data quality",
    data: response,
  });
}

export async function handleMarketDataCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "fetch") {
    return handleMarketDataFetchCommandAsync(runtime, args);
  }
  if (sub === "health") {
    return handleMarketDataHealthCommandAsync(runtime, args);
  }
  if (sub === "quality") {
    return handleMarketDataQualityCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
    `Unknown market-data command: ${sub ?? "(missing)"} (use fetch|health|quality)`,
  );
}
