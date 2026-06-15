import { runMarketMonitor } from "../../data/marketAgent.js";
import {
  CLI_FLAG_ALLOW_LIVE_FALLBACK,
  CLI_FLAG_LIMIT,
  CLI_FLAG_MIN_REQUIRED,
  CLI_FLAG_SYMBOLS,
  CLI_FLAG_TIMEFRAMES,
} from "../../constants/cliFlags.js";
import {
  ERROR_CODE_SYMBOLS_REQUIRED,
  ERROR_CODE_TIMEFRAMES_REQUIRED,
  ERROR_CODE_UNKNOWN_MARKET_MONITOR_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseOptionalBooleanFlag,
  parseOptionalIntFlag,
  parseRequiredCsvFlag,
} from "../argParser.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleMarketMonitorRunCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "run") {
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_MARKET_MONITOR_COMMAND,
      `Unknown market-monitor command: ${args[1] ?? "(missing)"} (use run)`,
    );
  }
  const symbols = parseRequiredCsvFlag(
    args,
    CLI_FLAG_SYMBOLS,
    ERROR_CODE_SYMBOLS_REQUIRED,
    "market-monitor run requires --symbols",
  ).map((value) => value.toUpperCase());
  const timeframes = parseRequiredCsvFlag(
    args,
    CLI_FLAG_TIMEFRAMES,
    ERROR_CODE_TIMEFRAMES_REQUIRED,
    "market-monitor run requires --timeframes",
  );
  const limit = parseOptionalIntFlag(args, CLI_FLAG_LIMIT);
  const minRequired = parseOptionalIntFlag(args, CLI_FLAG_MIN_REQUIRED);
  const allowLiveFallback = parseOptionalBooleanFlag(args, CLI_FLAG_ALLOW_LIVE_FALLBACK);

  const response = await runMarketMonitor({
    symbols,
    timeframes,
    limit,
    min_required: minRequired,
    allow_live_fallback: allowLiveFallback,
  });
  return toEnvelope({
    ok: true,
    command: "market-monitor run",
    data: response,
  });
}
