import { z, type ZodTypeAny } from "zod";

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
import {
  ERROR_CODE_SNAPSHOT_ID_REQUIRED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

const optionalPositiveInt = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

function resolveSessionId(opts: { sessionId?: string; profile?: string }): string {
  return opts.sessionId ?? opts.profile ?? "default";
}

export const ContextBootstrapOpts = z.object({
  sessionId: z.string().optional(),
  profile: z.string().optional(),
  symbol: z.string().optional(),
  maxChars: optionalPositiveInt,
  output: z.string().optional(),
});
export type ContextBootstrapOpts = z.infer<typeof ContextBootstrapOpts>;

export const ContextLatestOpts = z.object({
  sessionId: z.string().optional(),
  profile: z.string().optional(),
  symbol: z.string().optional(),
});
export type ContextLatestOpts = z.infer<typeof ContextLatestOpts>;

export const ContextSnapshotsListOpts = z.object({
  symbol: z.string().min(1, ERROR_CODE_SYMBOL_REQUIRED),
  limit: z.coerce.number().int().positive().default(20),
});
export type ContextSnapshotsListOpts = z.infer<typeof ContextSnapshotsListOpts>;

export const ContextSnapshotsShowOpts = z.object({
  snapshotId: z.string().min(1, ERROR_CODE_SNAPSHOT_ID_REQUIRED),
});
export type ContextSnapshotsShowOpts = z.infer<typeof ContextSnapshotsShowOpts>;

function parseSymbolRequiredOpts<Schema extends ZodTypeAny>(
  schema: Schema,
  raw: unknown,
  message: string,
): z.infer<Schema> {
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

export function parseContextSnapshotsListOpts(raw: unknown): ContextSnapshotsListOpts {
  return parseSymbolRequiredOpts(
    ContextSnapshotsListOpts,
    raw,
    "context snapshots list requires --symbol",
  );
}

export function parseContextSnapshotsShowOpts(raw: unknown): ContextSnapshotsShowOpts {
  try {
    return parseOpts(ContextSnapshotsShowOpts, raw);
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      if (
        error.code === ERROR_CODE_SNAPSHOT_ID_REQUIRED ||
        error.message.includes("snapshotId")
      ) {
        throw new WorkflowCommandError(
          ERROR_CODE_SNAPSHOT_ID_REQUIRED,
          "context snapshots show requires a snapshot_id",
        );
      }
    }
    throw error;
  }
}

export async function handleContextBootstrapAsync(
  _runtime: Stage1Runtime,
  opts: ContextBootstrapOpts,
): Promise<WorkflowEnvelope> {
  const sessionId = resolveSessionId(opts);
  const outputPath = opts.output ?? DEFAULT_CONTEXT_PACK_PATH;

  const response = await bootstrapContext({
    session_id: sessionId,
    symbol: opts.symbol?.toUpperCase(),
    max_chars: opts.maxChars,
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
  opts: ContextLatestOpts,
): Promise<WorkflowEnvelope> {
  const sessionId = resolveSessionId(opts);
  const response = await getLatestContext({
    session_id: sessionId,
    symbol: opts.symbol?.toUpperCase(),
  });
  return toEnvelope({
    ok: true,
    command: "context latest",
    data: {
      context_pack: response,
    },
  });
}

export async function handleContextSnapshotsListCommandAsync(
  _runtime: Stage1Runtime,
  opts: ContextSnapshotsListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listContextSnapshots({
    symbol: opts.symbol,
    limit: opts.limit,
  });
  const snapshots = response.items.map((snapshot) => ({
    ...toContextSnapshotSummary(snapshot),
    symbol: snapshot.symbol,
    asof_ts: snapshot.asof_ts,
  }));
  return toEnvelope({
    ok: true,
    command: "context snapshots list",
    data: { snapshots, count: response.count },
  });
}

export async function handleContextSnapshotsShowCommandAsync(
  _runtime: Stage1Runtime,
  opts: ContextSnapshotsShowOpts,
): Promise<WorkflowEnvelope> {
  const snapshot = await fetchContextSnapshot(opts.snapshotId);
  return toEnvelope({
    ok: true,
    command: "context snapshots show",
    data: {
      ...toContextSnapshotSummary(snapshot),
      symbol: snapshot.symbol,
      asof_ts: snapshot.asof_ts,
      top_items: toTopWeightedItemSummaries(snapshot.items_json),
    },
  });
}

export async function handleContextCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "snapshots") {
    const snapSub = args[2];
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
      `Unknown context snapshots command: ${snapSub ?? "(missing)"} (use list|show)`,
    );
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
    `Unknown context command: ${sub ?? "(missing)"} (use snapshots|bootstrap|latest)`,
  );
}
