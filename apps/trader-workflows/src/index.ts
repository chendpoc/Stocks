#!/usr/bin/env node
import { fetchStage1 } from "./api/client.js";
import {
  type Stage1RunStatus,
  STAGE1_RUN_STATUSES,
} from "./runtime/checkpointStore.js";
import {
  Stage1Runtime,
  type Stage1RuntimeResumeHandlers,
} from "./runtime/stage1Runtime.js";
import { runDecisionGraph } from "./graphs/decisionGraph.js";
import { runDueOutcomeGraph } from "./graphs/outcomeGraph.js";
import { runEvaluationSummaryGraph } from "./graphs/evaluationGraph.js";
import { runInsightExplorationGraph } from "./graphs/insightExplorationGraph.js";
import {
  fetchContextSnapshot,
  listContextSnapshots,
  toContextSnapshotSummary,
  toTopWeightedItemSummaries,
} from "./services/contextSnapshots.js";

interface WorkflowError {
  code: string;
  message: string;
  details?: unknown;
}

interface WorkflowEnvelope {
  ok: boolean;
  command: string;
  run_id: string | null;
  status: Stage1RunStatus | null;
  data: Record<string, unknown> | null;
  error: WorkflowError | null;
}

class WorkflowCommandError extends Error {
  readonly code: string;

  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function parseArgs(argv: string[]): { commandArgs: string[] } {
  const commandArgs = argv.filter((item) => item !== "--json");
  return { commandArgs };
}

function parseLimit(args: string[]): number {
  const limitFlagIndex = args.indexOf("--limit");
  if (limitFlagIndex < 0) {
    return 50;
  }
  const raw = args[limitFlagIndex + 1];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError("INVALID_LIMIT", "limit must be a positive integer");
  }
  return parsed;
}

function toEnvelope(args: {
  ok: boolean;
  command: string;
  run_id?: string | null;
  status?: Stage1RunStatus | null;
  data?: Record<string, unknown> | null;
  error?: WorkflowError | null;
}): WorkflowEnvelope {
  return {
    ok: args.ok,
    command: args.command,
    run_id: args.run_id ?? null,
    status: args.status ?? null,
    data: args.data ?? null,
    error: args.error ?? null,
  };
}

function normalizeStatus(status: unknown): Stage1RunStatus {
  if (STAGE1_RUN_STATUSES.includes(status as Stage1RunStatus)) {
    return status as Stage1RunStatus;
  }
  return "failed";
}

const WORKFLOW_RESUME_HANDLERS: Stage1RuntimeResumeHandlers = {
  DecisionGraph: (input) => runDecisionGraph(input),
  OutcomeGraph: (input) => runDueOutcomeGraph(input),
  EvaluationGraph: (input) => runEvaluationSummaryGraph(input),
  InsightExplorationGraph: (input) => {
    const symbol = typeof input.symbol === "string" ? input.symbol : "";
    const window = typeof input.window === "string" ? input.window : "";
    return runInsightExplorationGraph({ ...input, symbol, window });
  },
};

async function handleRunsCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  switch (sub) {
    case "list": {
      const limit = parseLimit(args);
      const runs = runtime.listRuns(limit);
      return toEnvelope({
        ok: true,
        command: "runs list",
        data: { runs },
      });
    }
    case "show": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          "RUN_ID_REQUIRED",
          "runs show requires a run_id",
        );
      }
      const run = runtime.showRun(runId);
      return toEnvelope({
        ok: true,
        command: "runs show",
        run_id: run.run_id,
        status: normalizeStatus(run.status),
        data: { run },
      });
    }
    case "resume": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          "RUN_ID_REQUIRED",
          "runs resume requires a run_id",
        );
      }
      const run = await runtime.resumeRun(runId, WORKFLOW_RESUME_HANDLERS);
      return toEnvelope({
        ok: true,
        command: "runs resume",
        run_id: run.run_id,
        status: normalizeStatus(run.status),
        data: { run },
      });
    }
    default:
      throw new WorkflowCommandError(
        "UNKNOWN_RUNS_COMMAND",
        `Unknown runs command: ${sub ?? "(missing)"} (use list|show|resume)`,
      );
  }
}

async function handleDecideCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = args[1];
  if (!symbol) {
    throw new WorkflowCommandError(
      "SYMBOL_REQUIRED",
      "decide requires a symbol argument",
    );
  }

  const executed = await runtime.runGraph({
    graph_name: "DecisionGraph",
    input: { symbol },
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError("RUN_INTERRUPTED", "DecisionGraph interrupted before completion");
  }
  return toEnvelope({
    ok: true,
    command: "decide",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      snapshot_id: result.snapshot.snapshot_id,
      decision_id: result.decision.decision_id,
      action: result.envelope.action,
      scheduled_outcome_count: result.scheduled_outcomes.length,
      paper_execution_submitted: result.paper_execution_submitted,
    },
  });
}

async function handleEvalSummaryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "summary") {
    throw new WorkflowCommandError(
      "SUMMARY_SUBCOMMAND_REQUIRED",
      "eval requires summary subcommand",
    );
  }

  const symbolFlagIndex = args.indexOf("--symbol");
  const modelVersionFlagIndex = args.indexOf("--model-version");
  const limitFlagIndex = args.indexOf("--limit");
  const symbol =
    symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1]?.toUpperCase() : undefined;
  const model_version =
    modelVersionFlagIndex >= 0 ? args[modelVersionFlagIndex + 1] : "stage1-v0";
  const limit =
    limitFlagIndex >= 0 ? Number.parseInt(args[limitFlagIndex + 1] ?? "", 10) : 500;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new WorkflowCommandError("INVALID_LIMIT", "limit must be a positive integer");
  }

  const executed = await runtime.runGraph({
    graph_name: "EvaluationGraph",
    node_name: "evaluation_summary",
    input: { symbol, model_version, limit },
    execute: (input) => runEvaluationSummaryGraph(input),
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError("RUN_INTERRUPTED", "EvaluationGraph interrupted before completion");
  }

  return toEnvelope({
    ok: true,
    command: "eval summary",
    run_id: executed.run.run_id,
    status: normalizeStatus(executed.run.status),
    data: {
      report_id: result.report.report_id,
      model_version: result.report.model_version,
      window_start: result.report.window_start,
      window_end: result.report.window_end,
      recommendation: result.report.recommendation,
      metrics_json: result.report.metrics_json,
      report_json: result.report.report_json,
      persisted_report: result.persisted_report,
    },
  });
}

async function handleInsightsExploreCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "explore") {
    throw new WorkflowCommandError(
      "EXPLORE_SUBCOMMAND_REQUIRED",
      "insights requires explore subcommand",
    );
  }

  const symbolFlagIndex = args.indexOf("--symbol");
  const windowFlagIndex = args.indexOf("--window");
  const symbol = args[symbolFlagIndex + 1]?.toUpperCase();
  const window = args[windowFlagIndex + 1];
  if (!symbol) {
    throw new WorkflowCommandError("SYMBOL_REQUIRED", "insights explore requires --symbol");
  }
  if (!window) {
    throw new WorkflowCommandError("WINDOW_REQUIRED", "insights explore requires --window");
  }

  const executed = await runtime.runGraph({
    graph_name: "InsightExplorationGraph",
    node_name: "insight_exploration",
    input: { symbol, window },
    execute: (input) => {
      const inputSymbol = typeof input.symbol === "string" ? input.symbol : symbol;
      const inputWindow = typeof input.window === "string" ? input.window : window;
      return runInsightExplorationGraph({
        ...input,
        symbol: inputSymbol,
        window: inputWindow,
      });
    },
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError("RUN_INTERRUPTED", "InsightExplorationGraph interrupted before completion");
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
    },
  });
}

function parsePositiveLimitFlag(args: string[], defaultLimit: number): number {
  const limitFlagIndex = args.indexOf("--limit");
  if (limitFlagIndex < 0) {
    return defaultLimit;
  }
  const parsed = Number.parseInt(args[limitFlagIndex + 1] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError("INVALID_LIMIT", "limit must be a positive integer");
  }
  return parsed;
}

async function handleContextCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "snapshots") {
    throw new WorkflowCommandError(
      "SNAPSHOTS_SUBCOMMAND_REQUIRED",
      "context requires snapshots subcommand (use list|show)",
    );
  }

  const sub = args[2];
  switch (sub) {
    case "list": {
      const symbolFlagIndex = args.indexOf("--symbol");
      const symbol = symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1] : undefined;
      if (!symbol) {
        throw new WorkflowCommandError(
          "SYMBOL_REQUIRED",
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
          "SNAPSHOT_ID_REQUIRED",
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
        "UNKNOWN_CONTEXT_COMMAND",
        `Unknown context snapshots command: ${sub ?? "(missing)"} (use list|show)`,
      );
  }
}

async function handleOutcomesRunCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "run" || !args.includes("--due")) {
    throw new WorkflowCommandError(
      "DUE_FLAG_REQUIRED",
      "outcomes run requires --due",
    );
  }

  const symbolFlagIndex = args.indexOf("--symbol");
  const limitFlagIndex = args.indexOf("--limit");
  const symbol =
    symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1]?.toUpperCase() : undefined;
  const limit =
    limitFlagIndex >= 0 ? Number.parseInt(args[limitFlagIndex + 1] ?? "", 10) : 100;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new WorkflowCommandError("INVALID_LIMIT", "limit must be a positive integer");
  }

  const executed = await runtime.runGraph({
    graph_name: "OutcomeGraph",
    node_name: "outcomes_due",
    input: { symbol, limit },
    execute: (input) => runDueOutcomeGraph(input),
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError("RUN_INTERRUPTED", "OutcomeGraph interrupted before completion");
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
      outcomes: result.outcomes,
    },
  });
}

async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args.length === 0) {
    throw new WorkflowCommandError(
      "COMMAND_REQUIRED",
      "Command required (expected: runs list|show|resume | decide SYMBOL | context snapshots list|show | outcomes run --due | eval summary | insights explore)",
    );
  }
  switch (args[0]) {
    case "runs":
      return handleRunsCommandAsync(runtime, args);
    case "decide":
      return handleDecideCommandAsync(runtime, args);
    case "outcomes":
      return handleOutcomesRunCommandAsync(runtime, args);
    case "eval":
      return handleEvalSummaryCommandAsync(runtime, args);
    case "insights":
      return handleInsightsExploreCommandAsync(runtime, args);
    case "context":
      return handleContextCommandAsync(runtime, args);
    default:
      throw new WorkflowCommandError(
        "UNKNOWN_COMMAND",
        `Unknown command: ${args[0]} (currently supported: runs, decide, context, outcomes, eval, insights)`,
      );
  }
}

function printEnvelope(envelope: WorkflowEnvelope): void {
  console.log(JSON.stringify(envelope));
}

function toErrorEnvelope(command: string, error: unknown): WorkflowEnvelope {
  if (error instanceof WorkflowCommandError) {
    return toEnvelope({
      ok: false,
      command,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }
  if (error instanceof Error) {
    return toEnvelope({
      ok: false,
      command,
      error: {
        code: "UNEXPECTED_ERROR",
        message: error.message,
      },
    });
  }
  return toEnvelope({
    ok: false,
    command,
    error: {
      code: "UNKNOWN_ERROR",
      message: "Unknown error",
      details: error,
    },
  });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const commandLabel =
    parsed.commandArgs.length > 0 ? parsed.commandArgs.join(" ") : "(none)";
  const runtime = new Stage1Runtime();
  try {
    const envelope = await handleCommandAsync(runtime, parsed.commandArgs);
    printEnvelope(envelope);
  } catch (error) {
    printEnvelope(toErrorEnvelope(commandLabel, error));
    process.exitCode = 1;
  } finally {
    runtime.close();
  }
}

void main();
