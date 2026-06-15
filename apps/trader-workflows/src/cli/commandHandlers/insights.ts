import { z } from "zod";

import { listInsightCandidates } from "../../data/marketAgent.js";
import { runInsightExplorationGraphViaRuntime } from "../../orchestration/graphRunner.js";
import {
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_WINDOW_REQUIRED,
} from "../../constants/errorCodes.js";
import { GRAPH_NAME_INSIGHT_EXPLORATION } from "../../constants/graphNames.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { normalizeStatus, toEnvelope, WorkflowCommandError } from "../helpers.js";
import { parseOpts } from "../parseOpts.js";

export const InsightsListOpts = z.object({
  symbol: z.string().optional(),
  verificationStatus: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
});
export type InsightsListOpts = z.infer<typeof InsightsListOpts>;

export const InsightsExploreOpts = z.object({
  symbol: z.string().min(1, ERROR_CODE_SYMBOL_REQUIRED),
  window: z.string().min(1, ERROR_CODE_WINDOW_REQUIRED),
});
export type InsightsExploreOpts = z.infer<typeof InsightsExploreOpts>;

function parseInsightsExploreOptsInternal(raw: unknown): InsightsExploreOpts {
  try {
    return parseOpts(InsightsExploreOpts, raw);
  } catch (error) {
    if (error instanceof WorkflowCommandError) {
      if (
        error.code === "SYMBOL_INVALID" ||
        error.code === ERROR_CODE_SYMBOL_REQUIRED ||
        error.message.includes("symbol")
      ) {
        throw new WorkflowCommandError(
          ERROR_CODE_SYMBOL_REQUIRED,
          "insights explore requires --symbol",
        );
      }
      if (
        error.code === "WINDOW_INVALID" ||
        error.code === ERROR_CODE_WINDOW_REQUIRED ||
        error.message.includes("window")
      ) {
        throw new WorkflowCommandError(
          ERROR_CODE_WINDOW_REQUIRED,
          "insights explore requires --window",
        );
      }
    }
    throw error;
  }
}

export function parseInsightsExploreOpts(raw: unknown): InsightsExploreOpts {
  return parseInsightsExploreOptsInternal(raw);
}

export async function handleInsightsExploreCommandAsync(
  runtime: Stage1Runtime,
  opts: InsightsExploreOpts,
): Promise<WorkflowEnvelope> {
  const executed = await runInsightExplorationGraphViaRuntime(runtime, {
    symbol: opts.symbol.toUpperCase(),
    window: opts.window,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_INSIGHT_EXPLORATION} interrupted before completion`);
  }
  return toEnvelope({
    ok: true,
    command: "insights explore",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      insight_id: result.insight_id,
      window: result.window.window,
      window_start: result.window.window_start,
      window_end: result.window.window_end,
      react_step_count: result.react_steps.length,
      verification_status: result.persisted_candidate?.verification_status ?? "pending",
      weight_cap: result.proposal.weight_cap,
      evidence_ref_count: result.proposal.evidence_refs.length,
      thesis: result.proposal.thesis,
      persisted_candidate: result.persisted_candidate,
      scheduled_outcome_id: result.scheduled_outcome?.outcome_id ?? null,
      scheduled_outcome_horizon: result.scheduled_outcome?.horizon ?? null,
    },
  });
}

export async function handleInsightsListCommandAsync(
  _runtime: Stage1Runtime,
  opts: InsightsListOpts,
): Promise<WorkflowEnvelope> {
  const response = await listInsightCandidates({
    symbol: opts.symbol,
    verification_status: opts.verificationStatus,
    limit: opts.limit,
  });
  return toEnvelope({
    ok: true,
    command: "insights list",
    data: {
      insight_candidates: response.items,
      count: response.count,
    },
  });
}

