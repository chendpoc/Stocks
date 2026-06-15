#!/usr/bin/env node
import "./bootstrap-env.js";
import { pathToFileURL } from "node:url";

export {
  alphaResearchGraph,
  buildAlphaResearchGraph,
  runAlphaResearchGraph,
} from "./graphs/04-alphaResearch/alphaResearchGraph.js";
export type {
  AlphaResearchGraphDeps,
  AlphaResearchGraphInput,
  AlphaResearchGraphResult,
} from "./graphs/04-alphaResearch/alphaResearchGraph.types.js";
export {
  buildRuleCandidateRequest,
  validateAlphaResearchInput,
  type AlphaResearchInput,
  type AlphaInputValidationReport,
} from "./services/alphaResearch.js";
export {
  buildAlphaSeedV1,
  type AlphaSeedV1,
} from "./services/insightCandidates.js";

import {
  type Stage1RunStatus,
  STAGE1_RUN_STATUSES,
} from "./runtime/checkpointStore.js";
import {
  isRunStatus,
  STAGE1_OBSERVABILITY_LIMIT_MAX,
  Stage1Runtime,
  type Stage1RuntimeResumeHandlers,
} from "./runtime/stage1Runtime.js";
import { runDecisionGraph } from "./graphs/00-decision/decisionGraph.js";
import type { GateDecision } from "./graphs/00-decision/decisionGraph.llmNodes.js";
import type { DecisionGraphInput } from "./graphs/00-decision/decisionGraph.types.js";
import { runDueOutcomeGraph } from "./graphs/01-outcome/outcomeGraph.js";
import { runEvaluationSummaryGraph } from "./graphs/02-evaluation/evaluationGraph.js";
import { runInsightExplorationGraph } from "./graphs/03-insightExploration/insightExplorationGraph.js";
import {
  fetchContextSnapshot,
  listContextSnapshots,
  toContextSnapshotSummary,
  toTopWeightedItemSummaries,
} from "./services/contextSnapshots.js";
import {
  runDecisionGraphViaRuntime,
  runEvaluationGraphViaRuntime,
  runInsightExplorationGraphViaRuntime,
  runOutcomeGraphViaRuntime,
} from "./api/graphRunner.js";
import {
  bootstrapContext,
  degradePatternMemory,
  fetchMarketData,
  getLatestContext,
  getMarketDataHealth,
  getMarketDataQuality,
  initMarketAgentMemory,
  listFailureMemories,
  listInsightCandidates,
  listPatternMemories,
  promotePatternMemory,
  runMarketMonitor,
} from "./api/commands/marketAgent.js";
import {
  listDecisionOutcomes,
  listModelDecisions,
} from "./api/commands/decisions.js";
import {
  DEFAULT_CONTEXT_PACK_PATH,
  writeContextPackFile,
} from "./services/contextPackFile.js";
import {
  CLI_FLAG_ALLOW_LIVE_FALLBACK,
  CLI_FLAG_CANDIDATE_ID,
  CLI_FLAG_CONFIRM,
  CLI_FLAG_DUE,
  CLI_FLAG_FAILURE_TYPE,
  CLI_FLAG_GATE_JSON,
  CLI_FLAG_GRAPH_NAME,
  CLI_FLAG_LIMIT,
  CLI_FLAG_MAX_CHARS,
  CLI_FLAG_MIN_REQUIRED,
  CLI_FLAG_MODEL_VERSION,
  CLI_FLAG_OUTPUT,
  CLI_FLAG_PATTERN_ID,
  CLI_FLAG_PATTERN_MEMORY_ID,
  CLI_FLAG_PROFILE,
  CLI_FLAG_REASON,
  CLI_FLAG_SESSION_ID,
  CLI_FLAG_SETUP,
  CLI_FLAG_STATUS,
  CLI_FLAG_SYMBOL,
  CLI_FLAG_SYMBOLS,
  CLI_FLAG_TIMEFRAME,
  CLI_FLAG_TIMEFRAMES,
  CLI_FLAG_TYPE,
  CLI_FLAG_VERIFICATION_STATUS,
  CLI_FLAG_WINDOW,
  CLI_FLAG_JSON,
} from "./constants/cliFlags.js";
import {
  ERROR_CODE_COMMAND_REQUIRED,
  ERROR_CODE_CONFIRM_REQUIRED,
  ERROR_CODE_DUE_FLAG_REQUIRED,
  ERROR_CODE_EXPLORE_SUBCOMMAND_REQUIRED,
  ERROR_CODE_GATE_JSON_INVALID,
  ERROR_CODE_GATE_JSON_REQUIRED,
  ERROR_CODE_INVALID_LIMIT,
  ERROR_CODE_INVALID_OUTCOME_STATUS,
  ERROR_CODE_INVALID_STATUS,
  ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
  ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
  ERROR_CODE_RUN_ID_REQUIRED,
  ERROR_CODE_RUN_INTERRUPTED,
  ERROR_CODE_SNAPSHOT_ID_REQUIRED,
  ERROR_CODE_SUMMARY_SUBCOMMAND_REQUIRED,
  ERROR_CODE_SYMBOL_REQUIRED,
  ERROR_CODE_SYMBOLS_REQUIRED,
  ERROR_CODE_TIMEFRAMES_REQUIRED,
  ERROR_CODE_UNEXPECTED_ERROR,
  ERROR_CODE_UNKNOWN_COMMAND,
  ERROR_CODE_UNKNOWN_CONTEXT_COMMAND,
  ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
  ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
  ERROR_CODE_UNKNOWN_MARKET_DATA_COMMAND,
  ERROR_CODE_UNKNOWN_MARKET_MONITOR_COMMAND,
  ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
  ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND,
  ERROR_CODE_UNKNOWN_RUNS_COMMAND,
  ERROR_CODE_UNKNOWN_ERROR,
  ERROR_CODE_WINDOW_REQUIRED,
} from "./constants/errorCodes.js";
import {
  GRAPH_NAME_DECISION,
  GRAPH_NAME_EVALUATION,
  GRAPH_NAME_INSIGHT_EXPLORATION,
  GRAPH_NAME_OUTCOME,
} from "./constants/graphNames.js";
import {
  OUTCOME_LIST_STATUSES,
  type OutcomeListStatus,
  type WorkflowEnvelope,
  type WorkflowError,
} from "./types/cli.js";

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
  const commandArgs = argv.filter((item) => item !== CLI_FLAG_JSON);
  return { commandArgs };
}

function parseLimit(args: string[]): number {
  return parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 50);
}

function isFlagValue(value: string): boolean {
  return value.startsWith("--");
}

function toFlagErrorCode(flag: string): string {
  return flag.replace(/^--/, "").toUpperCase().replace(/-/g, "_");
}

function parseOptionalStatus(args: string[]): Stage1RunStatus | undefined {
  const raw = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  if (!raw) {
    return undefined;
  }
  if (!isRunStatus(raw)) {
    throw new WorkflowCommandError(
      ERROR_CODE_INVALID_STATUS,
      `status must be one of: ${STAGE1_RUN_STATUSES.join(", ")}`,
    );
  }
  return raw;
}

const DEFAULT_OUTCOMES_LIST_LIMIT = 100;
const DEFAULT_INSIGHTS_LIST_LIMIT = 50;

function parseOptionalFlagValue(args: string[], flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex < 0) {
    return undefined;
  }
  const raw = args[flagIndex + 1];
  if (!raw || isFlagValue(raw)) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_VALUE_REQUIRED`,
      `${flag} requires a value`,
    );
  }
  return raw;
}

function parseRequiredFlagValue(
  args: string[],
  flag: string,
  code: string,
  message: string,
): string {
  const value = parseOptionalFlagValue(args, flag);
  if (!value) {
    throw new WorkflowCommandError(code, message);
  }
  return value;
}

function parseRequiredCsvFlag(args: string[], flag: string, code: string, message: string): string[] {
  const raw = parseRequiredFlagValue(args, flag, code, message);
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) {
    throw new WorkflowCommandError(code, message);
  }
  return values;
}

function parseOptionalBooleanFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseOptionalOutcomeStatus(args: string[]): OutcomeListStatus | undefined {
  const raw = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  if (!raw) {
    return undefined;
  }
  if (!OUTCOME_LIST_STATUSES.includes(raw as OutcomeListStatus)) {
    throw new WorkflowCommandError(
      ERROR_CODE_INVALID_OUTCOME_STATUS,
      `${CLI_FLAG_STATUS} must be one of: ${OUTCOME_LIST_STATUSES.join(", ")}`,
    );
  }
  return raw as OutcomeListStatus;
}

function parseOptionalGraphName(args: string[]): string | undefined {
  return parseOptionalFlagValue(args, CLI_FLAG_GRAPH_NAME);
}

function parseRunObservabilityLimit(args: string[]): number {
  return Math.min(parseLimit(args), STAGE1_OBSERVABILITY_LIMIT_MAX);
}

function parsePositiveIntegerFlag(
  args: string[],
  flag: string,
  defaultValue: number,
): number {
  const raw = parseOptionalFlagValue(args, flag);
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_INVALID`,
      `${flag} must be a positive integer`,
    );
  }
  return parsed;
}

function parseOptionalIntFlag(args: string[], flag: string): number | undefined {
  const raw = parseOptionalFlagValue(args, flag);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_INVALID`,
      `${flag} must be a positive integer`,
    );
  }
  return parsed;
}

function parseSessionIdOrProfile(args: string[]): string {
  return (
    parseOptionalFlagValue(args, CLI_FLAG_SESSION_ID) ??
    parseOptionalFlagValue(args, CLI_FLAG_PROFILE) ??
    "default"
  );
}

function parseOptionalFailureType(args: string[]): string | undefined {
  return parseOptionalFlagValue(args, CLI_FLAG_TYPE) ?? parseOptionalFlagValue(args, CLI_FLAG_FAILURE_TYPE);
}

function parsePatternMemoryPromoteInput(args: string[]): {
  pattern_memory_id?: string;
  candidate_id?: string;
} {
  if (!args.includes(CLI_FLAG_CONFIRM)) {
    throw new WorkflowCommandError(
      ERROR_CODE_CONFIRM_REQUIRED,
      "pattern-memory promote requires --confirm",
    );
  }
  const patternMemoryId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_MEMORY_ID);
  const candidateId = parseOptionalFlagValue(args, CLI_FLAG_CANDIDATE_ID);
  if (patternMemoryId && candidateId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
      "pattern-memory promote accepts either --pattern-memory-id or --candidate-id",
    );
  }
  if (!patternMemoryId && !candidateId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
      "pattern-memory promote requires --pattern-memory-id or --candidate-id",
    );
  }
  return { pattern_memory_id: patternMemoryId, candidate_id: candidateId };
}

function parsePatternMemoryDegradeInput(args: string[]): {
  pattern_memory_id?: string;
  pattern_id?: string;
  reason?: string;
} {
  const patternMemoryId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_MEMORY_ID);
  const patternId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_ID);
  if (patternMemoryId && patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
      "pattern-memory degrade accepts either --pattern-memory-id or --pattern-id",
    );
  }
  const reason = parseOptionalFlagValue(args, CLI_FLAG_REASON);
  if (!patternMemoryId && !patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
      "pattern-memory degrade requires --pattern-memory-id or --pattern-id",
    );
  }
  return { pattern_memory_id: patternMemoryId, pattern_id: patternId, reason };
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
  [GRAPH_NAME_DECISION]: (input) => runDecisionGraph(input),
  [GRAPH_NAME_OUTCOME]: (input) => runDueOutcomeGraph(input),
  [GRAPH_NAME_EVALUATION]: (input) => runEvaluationSummaryGraph(input),
  [GRAPH_NAME_INSIGHT_EXPLORATION]: (input) => {
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
          ERROR_CODE_RUN_ID_REQUIRED,
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
          ERROR_CODE_RUN_ID_REQUIRED,
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
    case "monitor": {
      const limit = parseRunObservabilityLimit(args);
      const status = parseOptionalStatus(args);
      const graphName = parseOptionalGraphName(args);
      const runs = runtime.listRunMonitorSummaries({
        status,
        graph_name: graphName,
        limit,
      });
      return toEnvelope({
        ok: true,
        command: "runs monitor",
        data: {
          runs,
          count: runs.length,
          filters: {
            status: status ?? null,
            graph_name: graphName ?? null,
            limit,
          },
        },
      });
    }
    case "trace": {
      const runId = args[2];
      if (!runId) {
        throw new WorkflowCommandError(
          ERROR_CODE_RUN_ID_REQUIRED,
          "runs trace requires a run_id",
        );
      }
      const detail = runtime.showRunTraceDetail(runId);
      return toEnvelope({
        ok: true,
        command: "runs trace",
        run_id: detail.run.run_id,
        status: normalizeStatus(detail.run.status),
        data: {
          run: detail.run,
          checkpoints: detail.checkpoints,
          output_summary: detail.output_summary,
          resume_hint: detail.resume_hint,
        },
      });
    }
    default:
      throw new WorkflowCommandError(
        ERROR_CODE_UNKNOWN_RUNS_COMMAND,
        `Unknown runs command: ${sub ?? "(missing)"} (use list|show|resume|monitor|trace)`,
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
      ERROR_CODE_SYMBOL_REQUIRED,
      "decide requires a symbol argument",
    );
  }

  const input: DecisionGraphInput = { symbol: symbol.toUpperCase() };

  const setupFlagIndex = args.indexOf(CLI_FLAG_SETUP);
  if (setupFlagIndex >= 0) {
    const setupName = args[setupFlagIndex + 1];
    if (setupName) {
      input.setup_name = setupName;
    }
  }

  const gateFlagIndex = args.indexOf(CLI_FLAG_GATE_JSON);
  if (gateFlagIndex >= 0) {
    const gateRaw = args[gateFlagIndex + 1];
    if (!gateRaw) {
      throw new WorkflowCommandError(
        ERROR_CODE_GATE_JSON_REQUIRED,
        "decide --gate-json requires a JSON payload",
      );
    }
    try {
      input.gate_decision = JSON.parse(gateRaw) as GateDecision;
    } catch {
      throw new WorkflowCommandError(
        ERROR_CODE_GATE_JSON_INVALID,
        "decide --gate-json must be valid JSON",
      );
    }
  }

  const executed = await runDecisionGraphViaRuntime(runtime, input);
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_DECISION} interrupted before completion`);
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
      ERROR_CODE_SUMMARY_SUBCOMMAND_REQUIRED,
      "eval requires summary subcommand",
    );
  }

  const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
  const modelVersionFlagIndex = args.indexOf(CLI_FLAG_MODEL_VERSION);
  const limitFlagIndex = args.indexOf(CLI_FLAG_LIMIT);
  const symbol =
    symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1]?.toUpperCase() : undefined;
  const model_version =
    modelVersionFlagIndex >= 0 ? args[modelVersionFlagIndex + 1] : "stage1-v0";
  const limit =
    limitFlagIndex >= 0 ? Number.parseInt(args[limitFlagIndex + 1] ?? "", 10) : 500;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new WorkflowCommandError(ERROR_CODE_INVALID_LIMIT, "limit must be a positive integer");
  }

  const executed = await runEvaluationGraphViaRuntime(runtime, {
    symbol,
    model_version,
    limit,
  });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_EVALUATION} interrupted before completion`);
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
      sections: result.report.sections,
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
      ERROR_CODE_EXPLORE_SUBCOMMAND_REQUIRED,
      "insights requires explore subcommand",
    );
  }

  const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
  const windowFlagIndex = args.indexOf(CLI_FLAG_WINDOW);
  const symbol = args[symbolFlagIndex + 1]?.toUpperCase();
  const window = args[windowFlagIndex + 1];
  if (!symbol) {
    throw new WorkflowCommandError(ERROR_CODE_SYMBOL_REQUIRED, `insights explore requires ${CLI_FLAG_SYMBOL}`);
  }
  if (!window) {
    throw new WorkflowCommandError(ERROR_CODE_WINDOW_REQUIRED, `insights explore requires ${CLI_FLAG_WINDOW}`);
  }

  const executed = await runInsightExplorationGraphViaRuntime(runtime, {
    symbol,
    window,
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

async function handleOutcomesListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const status = parseOptionalOutcomeStatus(args);
  const limit = parsePositiveLimitFlag(args, DEFAULT_OUTCOMES_LIST_LIMIT);
  const response = await listDecisionOutcomes({ symbol, status, limit });
  return toEnvelope({
    ok: true,
    command: "outcomes list",
    data: {
      outcomes: response.items,
      count: response.count,
    },
  });
}

async function handleInsightsListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const verification_status = parseOptionalFlagValue(args, CLI_FLAG_VERIFICATION_STATUS);
  const limit = parsePositiveLimitFlag(args, DEFAULT_INSIGHTS_LIST_LIMIT);
  const response = await listInsightCandidates({ symbol, verification_status, limit });
  return toEnvelope({
    ok: true,
    command: "insights list",
    data: {
      insight_candidates: response.items,
      count: response.count,
    },
  });
}

async function handleDecisionsListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const modelVersion = parseOptionalFlagValue(args, CLI_FLAG_MODEL_VERSION);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 500);
  const response = await listModelDecisions({
    symbol,
    model_version: modelVersion,
    limit,
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

async function handleDecisionsCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleDecisionsListCommandAsync(_runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
    `Unknown decisions command: ${sub ?? "(missing)"} (use list)`,
  );
}

async function handleOutcomesCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleOutcomesListCommandAsync(runtime, args);
  }
  if (sub === "run") {
    return handleOutcomesRunCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_OUTCOMES_COMMAND,
    `Unknown outcomes command: ${sub ?? "(missing)"} (use list|run)`,
  );
}

async function handleInsightsCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "explore") {
    return handleInsightsExploreCommandAsync(runtime, args);
  }
  if (sub === "list") {
    return handleInsightsListCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_INSIGHTS_COMMAND,
    `Unknown insights command: ${sub ?? "(missing)"} (use explore|list)`,
  );
}

async function handleContextBootstrapAsync(
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

async function handleContextLatestAsync(
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

async function handlePatternMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const pattern_id = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_ID);
  const status = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 100);
  const response = await listPatternMemories({
    symbol: symbol?.toUpperCase(),
    pattern_id,
    status,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "pattern-memory list",
    data: {
      pattern_memories: response.items,
      count: response.count,
    },
  });
}

async function handlePatternMemoryPromoteCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const input = parsePatternMemoryPromoteInput(args);
  const response = await promotePatternMemory({
    pattern_memory_id: input.pattern_memory_id,
    candidate_id: input.candidate_id,
    confirm: true,
  });
  return toEnvelope({
    ok: true,
    command: "pattern-memory promote",
    data: {
      pattern_memory: response.item,
    },
  });
}

async function handlePatternMemoryDegradeCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const input = parsePatternMemoryDegradeInput(args);
  const response = await degradePatternMemory(input);
  return toEnvelope({
    ok: true,
    command: "pattern-memory degrade",
    data: {
      pattern_memory: response.item,
    },
  });
}

async function handlePatternMemoryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handlePatternMemoryListCommandAsync(runtime, args);
  }
  if (sub === "promote") {
    return handlePatternMemoryPromoteCommandAsync(runtime, args);
  }
  if (sub === "degrade") {
    return handlePatternMemoryDegradeCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_PATTERN_MEMORY_COMMAND,
    `Unknown pattern-memory command: ${sub ?? "(missing)"} (use list|promote|degrade)`,
  );
}

async function handleFailureMemoryListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const failureType = parseOptionalFailureType(args);
  const setup = parseOptionalFlagValue(args, CLI_FLAG_SETUP);
  const status = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 100);
  const response = await listFailureMemories({
    symbol: symbol?.toUpperCase(),
    failure_type: failureType,
    setup,
    status,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "failure-memory list",
    data: {
      failure_memories: response.items,
      count: response.count,
    },
  });
}

async function handleFailureMemoryCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleFailureMemoryListCommandAsync(runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_FAILURE_MEMORY_COMMAND,
    `Unknown failure-memory command: ${sub ?? "(missing)"} (use list)`,
  );
}

function parsePositiveLimitFlag(args: string[], defaultLimit: number): number {
  return parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, defaultLimit);
}

async function handleContextCommandAsync(
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

async function handleOutcomesRunCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args[1] !== "run" || !args.includes(CLI_FLAG_DUE)) {
    throw new WorkflowCommandError(
      ERROR_CODE_DUE_FLAG_REQUIRED,
      "outcomes run requires --due",
    );
  }

  const symbolFlagIndex = args.indexOf(CLI_FLAG_SYMBOL);
  const limitFlagIndex = args.indexOf(CLI_FLAG_LIMIT);
  const symbol =
    symbolFlagIndex >= 0 ? args[symbolFlagIndex + 1]?.toUpperCase() : undefined;
  const limit =
    limitFlagIndex >= 0 ? Number.parseInt(args[limitFlagIndex + 1] ?? "", 10) : 100;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new WorkflowCommandError(ERROR_CODE_INVALID_LIMIT, "limit must be a positive integer");
  }

  const executed = await runOutcomeGraphViaRuntime(runtime, { symbol, limit });
  const result = executed.output;
  if (!result) {
    throw new WorkflowCommandError(ERROR_CODE_RUN_INTERRUPTED, `${GRAPH_NAME_OUTCOME} interrupted before completion`);
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

export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args.length === 0) {
    throw new WorkflowCommandError(
      ERROR_CODE_COMMAND_REQUIRED,
      "Command required (expected: memory init | runs list|show|resume|monitor|trace | decide SYMBOL | decisions list | context snapshots list|show | context bootstrap|latest | outcomes run --due|list | eval summary | insights explore|list | pattern-memory list|promote|degrade | failure-memory list | market-monitor run | market-data fetch|health|quality)",
    );
  }
  switch (args[0]) {
    case "memory":
      return handleMemoryCommandAsync(runtime, args);
    case "runs":
      return handleRunsCommandAsync(runtime, args);
    case "decide":
      return handleDecideCommandAsync(runtime, args);
    case "outcomes":
      return handleOutcomesCommandAsync(runtime, args);
    case "decisions":
      return handleDecisionsCommandAsync(runtime, args);
    case "eval":
      return handleEvalSummaryCommandAsync(runtime, args);
    case "insights":
      return handleInsightsCommandAsync(runtime, args);
    case "context":
      return handleContextCommandAsync(runtime, args);
    case "market-monitor":
      return handleMarketMonitorRunCommandAsync(runtime, args);
    case "market-data":
      return handleMarketDataCommandAsync(runtime, args);
    case "pattern-memory":
      return handlePatternMemoryCommandAsync(runtime, args);
    case "failure-memory":
      return handleFailureMemoryCommandAsync(runtime, args);
    default:
      throw new WorkflowCommandError(
        ERROR_CODE_UNKNOWN_COMMAND,
        `Unknown command: ${args[0]} (currently supported: memory, runs, decide, decisions, context, outcomes, eval, insights, pattern-memory, failure-memory, market-monitor, market-data)`,
      );
  }
}

async function handleMemoryCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "init") {
    const response = await initMarketAgentMemory();
    return toEnvelope({
      ok: true,
      command: "memory init",
      data: response,
    });
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
    `Unknown memory command: ${sub ?? "(missing)"} (use init)`,
  );
}

async function handleMarketMonitorRunCommandAsync(
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

async function handleMarketDataFetchCommandAsync(
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

async function handleMarketDataHealthCommandAsync(
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

async function handleMarketDataQualityCommandAsync(
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

async function handleMarketDataCommandAsync(
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
        code: ERROR_CODE_UNEXPECTED_ERROR,
        message: error.message,
      },
    });
  }
  return toEnvelope({
    ok: false,
    command,
    error: {
      code: ERROR_CODE_UNKNOWN_ERROR,
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

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isCliEntrypoint()) {
  void main();
}
