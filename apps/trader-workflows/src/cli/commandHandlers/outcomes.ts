import { z } from "zod";

import { listDecisionOutcomes } from "../../data/marketAgent.js";
import { runOutcomeGraphViaRuntime } from "../../orchestration/graphRunner.js";
import {
  ERROR_CODE_DUE_FLAG_REQUIRED,
  ERROR_CODE_INVALID_OUTCOME_STATUS,
  ERROR_CODE_RUN_INTERRUPTED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_OUTCOME } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { OUTCOME_LIST_STATUSES } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

export const OutcomesListOpts = z.object({
  symbol: z.string().optional(),
  status: z
    .enum(OUTCOME_LIST_STATUSES, {
      errorMap: () => ({
        message: `status must be one of: ${OUTCOME_LIST_STATUSES.join(", ")}`,
      }),
    })
    .optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type OutcomesListOpts = z.infer<typeof OutcomesListOpts>;

function parseOutcomesListOptsInternal(raw: unknown): OutcomesListOpts {
  try {
    return parseOpts(OutcomesListOpts, raw);
  } catch (error) {
    if (
      error instanceof WorkflowCommandError &&
      error.message.includes("status must be one of")
    ) {
      throw new WorkflowCommandError(ERROR_CODE_INVALID_OUTCOME_STATUS, error.message);
    }
    throw error;
  }
}

export async function handleOutcomesListCommandAsync(
  _runtime: Stage1Runtime,
  opts: OutcomesListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listDecisionOutcomes({
    symbol: opts.symbol,
    status: opts.status,
    limit: opts.limit,
  });
  return toEnvelope({
    ok: true,
    command: "outcomes list",
    data: {
      outcomes: response.items,
      count: response.count,
    },
  });
}

/** Wire commander outcomes list actions through shared status error mapping. */
export function parseOutcomesListOpts(raw: unknown): OutcomesListOpts {
  return parseOutcomesListOptsInternal(raw);
}

export const OutcomesRunOpts = z.object({
  due: z.literal(true, {
    errorMap: () => ({ message: "outcomes run requires --due" }),
  }),
  symbol: z.string().optional(),
  limit: z.coerce.number().int().positive().default(100),
});
export type OutcomesRunOpts = z.infer<typeof OutcomesRunOpts>;

function parseOutcomesRunOptsInternal(raw: unknown): OutcomesRunOpts {
  try {
    return parseOpts(OutcomesRunOpts, raw);
  } catch (error) {
    if (
      error instanceof WorkflowCommandError &&
      error.message.includes("outcomes run requires --due")
    ) {
      throw new WorkflowCommandError(ERROR_CODE_DUE_FLAG_REQUIRED, error.message);
    }
    throw error;
  }
}

export function parseOutcomesRunOpts(raw: unknown): OutcomesRunOpts {
  return parseOutcomesRunOptsInternal(raw);
}

export async function handleOutcomesRunCommandAsync(
  runtime: Stage1Runtime,
  opts: OutcomesRunOpts,
): Promise<WorkflowEnvelope> {
  const executed = await runOutcomeGraphViaRuntime(runtime, {
    symbol: opts.symbol?.toUpperCase(),
    limit: opts.limit,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(
      ERROR_CODE_RUN_INTERRUPTED,
      `${GRAPH_NAME_OUTCOME} interrupted before completion`,
    );
  }
  return toEnvelope({
    ok: true,
    command: "outcomes run --due",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      processed_count: result.processed_count,
      labeled_count: result.labeled_count,
      skipped_count: result.skipped_count,
      failed_count: result.failed_count,
      counts_by_source_type: result.counts_by_source_type,
      counts_by_normalized_label: result.counts_by_normalized_label,
      outcomes: result.outcomes,
    },
  });
}
