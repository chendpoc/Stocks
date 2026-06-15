import {
  bootstrapContext,
  getLatestContext,
} from "../../data/marketAgent.js";
import {
  fetchContextSnapshot,
  listContextSnapshots,
} from "../../data/contextSnapshots.js";
import {
  toContextSnapshotSummary,
  toTopWeightedItemSummaries,
} from "../../services/contextSnapshots.js";
import {
  DEFAULT_CONTEXT_PACK_PATH,
  writeContextPackFile,
} from "../../services/contextPackFile.js";
import { CLI_FLAG_MAX_CHARS, CLI_FLAG_OUTPUT, CLI_FLAG_SYMBOL } from "../../constants/cliFlags.js";
import {
  ERROR_CODE_SNAPSHOT_ID_REQUIRED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import {
  parseOptionalFlagValue,
  parseOptionalIntFlag,
  parsePositiveLimitFlag,
  parseSessionIdOrProfile,
} from "../flagParsing.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleContextBootstrapAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sessionId = parseSessionIdOrProfile(args);
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const maxChars = parseOptionalIntFlag(args, CLI_FLAG_MAX_CHARS);
  const outputPath =
    parseOptionalFlagValue(args, CLI_FLAG_OUTPUT) ?? DEFAULT_CONTEXT_PACK_PATH;

  const response = await bootstrapContext({
    session_id: sessionId,
    symbol: symbol?.toUpperCase(),
    max_chars: maxChars,
  });
  const writtenPath = await writeContextPackFile(
    outputPath,
    response.markdown ?? "",
  );
  return toEnvelope({
    ok: true,
    command: "context bootstrap",
    data: {
      context_pack: response,
      path: writtenPath,
    },
  });
}

export async function handleContextLatestAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sessionId = parseSessionIdOrProfile(args);
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const response = await getLatestContext({
    session_id: sessionId,
    symbol: symbol?.toUpperCase(),
  });
  return toEnvelope({
    ok: true,
    command: "context latest",
    data: {
      context_pack: response,
    },
  });
}

export async function handleContextCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] === "bootstrap") {
    return handleContextBootstrapAsync(_runtime, args);
  }
  if (args[1] === "latest") {
    return handleContextLatestAsync(_runtime, args);
  }
  if (args[1] === "snapshots") {
    const sub = args[2];
    switch (sub) {
      case "list": {
        const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
        const symbol = symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1] : undefined;
        if (!symbol) {
          throw new WorkflowCommandError(
            ERROR_CODE_SYMBOL_REQUIRED,
            "context snapshots list requires --symbol",
          );
        }
        const limit = parsePositiveLimitFlag(args, 20);
        const response = await listContextSnapshots({
          symbol,
          limit,
        });
        const snapshots = response.items.map((snapshot) => ({
          snapshot_id: snapshot.snapshot_id,
          symbol: snapshot.symbol,
          asof_ts: snapshot.asof_ts,
          ...toContextSnapshotSummary(snapshot),
        }));
        return toEnvelope({
          ok: true,
          command: "context snapshots list",
          data: { snapshots, count: response.count },
        });
      }
      case "show": {
        const snapshotId = args[3];
        if (!snapshotId) {
          throw new WorkflowCommandError(
            ERROR_CODE_SNAPSHOT_ID_REQUIRED,
            "context snapshots show requires a snapshot_id",
          );
        }
        const snapshot = await fetchContextSnapshot(snapshotId);
        return toEnvelope({
          ok: true,
          command: "context snapshots show",
          data: {
            snapshot_id: snapshot.snapshot_id,
            symbol: snapshot.symbol,
            asof_ts: snapshot.asof_ts,
            ...toContextSnapshotSummary(snapshot),
            top_items: toTopWeightedItemSummaries(snapshot.items_json),
          },
        });
      }
      default:
        throw new WorkflowCommandError(
          ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
          `Unknown context snapshots command: ${sub ?? "(missing)"} (use list|show)`,
        );
    }
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
    "context requires snapshots|bootstrap|latest subcommand (use list|show|bootstrap|latest)",
  );
}
