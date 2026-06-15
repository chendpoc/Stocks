import { randomUUID } from "node:crypto";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  buildDecisionGraph,
  stateToDecisionGraphResult,
  type DecisionGraphDeps,
  type DecisionGraphResult,
} from "../graphs/00-decision/decisionGraph.js";
import {
  buildOutcomeGraph,
  stateToOutcomeGraphResult,
  type OutcomeGraphDeps,
  type OutcomeGraphRunResult,
} from "../graphs/01-outcome/outcomeGraph.js";
import {
  buildEvaluationGraph,
  stateToEvaluationGraphResult,
  type EvaluationGraphDeps,
  type EvaluationGraphRunResult,
} from "../graphs/02-evaluation/evaluationGraph.js";
import {
  buildInsightExplorationGraph,
  stateToInsightExplorationGraphResult,
  type InsightExplorationGraphDeps,
  type InsightExplorationGraphResult,
} from "../graphs/03-insightExploration/insightExplorationGraph.js";
import { toContextSnapshotSummary } from "../services/contextSnapshots.js";
import {
  type Stage1CheckpointRecord,
  Stage1CheckpointStore,
  type Stage1RunDetail,
  type Stage1RunStatus,
  type Stage1RunSummary,
} from "./checkpointStore.js";
import { logger } from "./logger.js";
import {
  createLanggraphCheckpointer,
  readLatestLanggraphCheckpointRef,
  resolveLanggraphCheckpointDbPath,
} from "./langgraphCheckpointer.js";

export interface Stage1RuntimeRunView extends Stage1RunDetail {
  checkpoints: Stage1CheckpointRecord[];
}

export interface Stage1RunMonitorOptions {
  status?: Stage1RunStatus;
  graph_name?: string;
  limit?: number;
}

export interface Stage1RunMonitorSummary {
  run_id: string;
  graph_name: string;
  status: Stage1RunStatus;
  current_node: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  duration_ms: number;
  checkpoint_count: number;
  latest_checkpoint_ref: string | null;
  has_error: boolean;
  latest_error: string | null;
  resumable: boolean;
}

export interface Stage1RunTraceCheckpointSummary {
  checkpoint_id: string;
  run_id: string;
  seq: number;
  node_name: string;
  created_at: string;
  state_summary: Record<string, unknown>;
}

export type Stage1RunOutputSummary = Record<string, unknown>;

export interface Stage1RunResumeHint {
  resumable: boolean;
  reason: string | null;
  command: string | null;
}

export interface Stage1RunTraceDetail {
  run: Stage1RunMonitorSummary;
  checkpoints: Stage1RunTraceCheckpointSummary[];
  output_summary: Stage1RunOutputSummary;
  resume_hint: Stage1RunResumeHint;
}

export interface Stage1RuntimeStartOptions {
  graph_name?: string;
  input?: Record<string, unknown>;
  interrupt_after_bootstrap?: boolean;
}

export type Stage1RuntimeGraphExecutor<
  TInput extends Record<string, unknown>,
  TOutput,
> = (input: TInput & { run_id: string }) => Promise<TOutput>;

export interface Stage1RuntimeGraphOptions<
  TInput extends Record<string, unknown>,
  TOutput,
> {
  graph_name: string;
  node_name?: string;
  input?: TInput;
  execute?: Stage1RuntimeGraphExecutor<TInput, TOutput>;
  interrupt_before_execute?: boolean;
}

export interface Stage1RuntimeGraphResult<TOutput> {
  run: Stage1RuntimeRunView;
  output: TOutput | null;
}

export type Stage1RuntimeResumeHandlers = Record<
  string,
  Stage1RuntimeGraphExecutor<Record<string, unknown>, unknown>
>;

const NATIVE_DECISION_GRAPH = "DecisionGraph";
const NATIVE_OUTCOME_GRAPH = "OutcomeGraph";
const NATIVE_EVALUATION_GRAPH = "EvaluationGraph";
const NATIVE_INSIGHT_EXPLORATION_GRAPH = "InsightExplorationGraph";

const NATIVE_LANGGRAPH_GRAPHS = new Set([
  NATIVE_DECISION_GRAPH,
  NATIVE_OUTCOME_GRAPH,
  NATIVE_EVALUATION_GRAPH,
  NATIVE_INSIGHT_EXPLORATION_GRAPH,
]);

const RuntimeGraphState = Annotation.Root({
  run_id: Annotation<string>(),
  input: Annotation<Record<string, unknown>>(),
  output: Annotation<unknown | null>(),
});

export const STAGE1_OBSERVABILITY_LIMIT_MAX = 200;

function isNativeLangGraphRun(graphName: string): boolean {
  return NATIVE_LANGGRAPH_GRAPHS.has(graphName);
}

function isNativeDecisionGraphRun(graphName: string): boolean {
  return graphName === NATIVE_DECISION_GRAPH;
}

function isNativeOutcomeGraphRun(graphName: string): boolean {
  return graphName === NATIVE_OUTCOME_GRAPH;
}

function isNativeEvaluationGraphRun(graphName: string): boolean {
  return graphName === NATIVE_EVALUATION_GRAPH;
}

function isNativeInsightExplorationGraphRun(graphName: string): boolean {
  return graphName === NATIVE_INSIGHT_EXPLORATION_GRAPH;
}

function isNativeLangGraphRegistryRun(run: {
  graph_name: string;
  thread_id?: string | null;
}): boolean {
  return isNativeLangGraphRun(run.graph_name) && Boolean(run.thread_id);
}

function parseGateDecisionInput(
  value: unknown,
): { complexity_score: number; symbols: string[]; setups?: Record<string, string> } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const complexity_score =
    typeof record.complexity_score === "number" ? record.complexity_score : undefined;
  const symbols = Array.isArray(record.symbols)
    ? record.symbols.filter((s): s is string => typeof s === "string")
    : undefined;
  if (complexity_score === undefined || !symbols) {
    return undefined;
  }
  const setups =
    record.setups && typeof record.setups === "object" && !Array.isArray(record.setups)
      ? Object.fromEntries(
        Object.entries(record.setups as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
      : undefined;
  return {
    complexity_score,
    symbols: symbols.map((s) => s.toUpperCase()),
    ...(Object.keys(setups ?? {}).length > 0 ? { setups } : {}),
  };
}

function buildDecisionGraphInvokeState(
  runId: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : "";
  const gate_decision =
    parseGateDecisionInput(input.gate_decision) ??
    (symbol
      ? {
        complexity_score: 0.1,
        symbols: [symbol],
      }
      : undefined);

  return {
    run_id: runId,
    thread_id: runId,
    symbol,
    setup_name: typeof input.setup_name === "string" ? input.setup_name : "",
    gate_decision,
    taskType: typeof input.taskType === "string" ? input.taskType : undefined,
    asof_ts: typeof input.asof_ts === "string" ? input.asof_ts : undefined,
    model_version:
      typeof input.model_version === "string" ? input.model_version : undefined,
  };
}

function toBoundedDecisionInput(input: Record<string, unknown>): Record<string, unknown> {
  const bounded: Record<string, unknown> = {};
  if (typeof input.symbol === "string") {
    bounded.symbol = input.symbol.toUpperCase();
  }
  if (typeof input.asof_ts === "string") {
    bounded.asof_ts = input.asof_ts;
  }
  if (typeof input.model_version === "string") {
    bounded.model_version = input.model_version;
  }
  if (typeof input.taskType === "string") {
    bounded.taskType = input.taskType;
  }
  if (typeof input.setup_name === "string") {
    bounded.setup_name = input.setup_name;
  }
  const gate = parseGateDecisionInput(input.gate_decision);
  if (gate) {
    bounded.gate_decision = gate;
  }
  return bounded;
}

function toBoundedOutcomeInput(input: Record<string, unknown>): Record<string, unknown> {
  const bounded: Record<string, unknown> = {};
  if (typeof input.symbol === "string") {
    bounded.symbol = input.symbol.toUpperCase();
  }
  if (typeof input.now === "string") {
    bounded.now = input.now;
  }
  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    bounded.limit = input.limit;
  }
  return bounded;
}

function toBoundedEvaluationInput(input: Record<string, unknown>): Record<string, unknown> {
  const bounded: Record<string, unknown> = {};
  if (typeof input.symbol === "string") {
    bounded.symbol = input.symbol.toUpperCase();
  }
  if (typeof input.model_version === "string") {
    bounded.model_version = input.model_version;
  }
  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    bounded.limit = input.limit;
  }
  if (typeof input.persist === "boolean") {
    bounded.persist = input.persist;
  }
  return bounded;
}

function toBoundedInsightExplorationInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const bounded: Record<string, unknown> = {};
  if (typeof input.symbol === "string") {
    bounded.symbol = input.symbol.toUpperCase();
  }
  if (typeof input.window === "string") {
    bounded.window = input.window;
  }
  if (typeof input.exploration_prompt === "string") {
    bounded.exploration_prompt = input.exploration_prompt;
  }
  if (
    typeof input.snapshot_limit === "number" &&
    Number.isFinite(input.snapshot_limit) &&
    input.snapshot_limit > 0
  ) {
    bounded.snapshot_limit = input.snapshot_limit;
  }
  if (
    typeof input.outcome_limit === "number" &&
    Number.isFinite(input.outcome_limit) &&
    input.outcome_limit > 0
  ) {
    bounded.outcome_limit = input.outcome_limit;
  }
  if (typeof input.persist === "boolean") {
    bounded.persist = input.persist;
  }
  return bounded;
}

function toBoundedEvaluationOutput(result: EvaluationGraphRunResult): Record<string, unknown> {
  return {
    report_id: result.report.report_id,
    model_version: result.report.model_version,
    window_start: result.report.window_start,
    window_end: result.report.window_end,
    recommendation: result.report.recommendation,
    persisted: result.persisted_report !== null,
  };
}

function toBoundedInsightExplorationOutput(
  result: InsightExplorationGraphResult,
): Record<string, unknown> {
  return {
    insight_id: result.insight_id,
    window: result.window.window,
    window_start: result.window.window_start,
    window_end: result.window.window_end,
    react_step_count: result.react_steps.length,
    verification_status: result.persisted_candidate?.verification_status ?? "pending",
    weight_cap: result.proposal.weight_cap,
    evidence_ref_count: result.proposal.evidence_refs.length,
  };
}

function toBoundedOutcomeOutput(result: OutcomeGraphRunResult): Record<string, unknown> {
  return {
    processed_count: result.processed_count,
    labeled_count: result.labeled_count,
    skipped_count: result.skipped_count,
    failed_count: result.failed_count,
    counts_by_source_type: result.counts_by_source_type,
    counts_by_normalized_label: result.counts_by_normalized_label,
    outcome_count: result.outcomes.length,
  };
}

function toBoundedDecisionOutput(result: DecisionGraphResult): Record<string, unknown> {
  return {
    snapshot_id: result.snapshot.snapshot_id,
    decision_id: result.decision.decision_id,
    action: result.envelope.action,
    scheduled_outcome_count: result.scheduled_outcomes.length,
    paper_execution_submitted: result.paper_execution_submitted,
    context_snapshot: toContextSnapshotSummary(result.snapshot),
  };
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeRunInput(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeObservabilityLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    return 50;
  }
  return Math.min(Math.trunc(limit), STAGE1_OBSERVABILITY_LIMIT_MAX);
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeDurationMs(run: Stage1RunSummary): number {
  const start = timestampMs(run.started_at) ?? timestampMs(run.created_at);
  const end =
    timestampMs(run.finished_at) ??
    timestampMs(run.updated_at) ??
    timestampMs(run.created_at);
  if (start === null || end === null || end < start) {
    return 0;
  }
  return end - start;
}

function toRunMonitorSummary(
  run: Stage1RunSummary,
  checkpoints: Stage1CheckpointRecord[],
): Stage1RunMonitorSummary {
  const latestCheckpoint = checkpoints.at(-1);
  return {
    run_id: run.run_id,
    graph_name: run.graph_name,
    status: run.status,
    current_node: run.current_node,
    started_at: run.started_at,
    finished_at: run.finished_at,
    updated_at: run.updated_at,
    duration_ms: computeDurationMs(run),
    checkpoint_count: checkpoints.length,
    latest_checkpoint_ref: run.checkpoint_ref ?? latestCheckpoint?.checkpoint_id ?? null,
    has_error: Boolean(run.latest_error),
    latest_error: run.latest_error,
    resumable: run.status === "interrupted",
  };
}

function toStateSummary(state: unknown): Record<string, unknown> {
  if (state === null || state === undefined) {
    return { type: "null", present: false };
  }
  if (Array.isArray(state)) {
    return { type: "array", present: true, item_count: state.length };
  }
  if (!isRecord(state)) {
    return { type: typeof state, present: true };
  }
  const summary: Record<string, unknown> = {
    type: "object",
    present: true,
    keys: Object.keys(state).sort(),
  };
  for (const key of ["stage", "graph_name", "runtime", "node_name", "next_node", "error"]) {
    if (typeof state[key] === "string") {
      summary[key] = state[key];
    }
  }
  return summary;
}

function pickRecordFields(
  source: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      picked[field] = source[field];
    }
  }
  return picked;
}

function toOutputSummary(
  graphName: string,
  output: unknown,
): Stage1RunOutputSummary {
  if (output === null || output === undefined) {
    return { type: "unknown", present: false };
  }
  if (!isRecord(output)) {
    return { type: "unknown", present: true };
  }
  switch (graphName) {
    case NATIVE_DECISION_GRAPH:
      return {
        type: NATIVE_DECISION_GRAPH,
        present: true,
        ...pickRecordFields(output, [
          "decision_id",
          "action",
          "snapshot_id",
          "scheduled_outcome_count",
          "paper_execution_submitted",
        ]),
      };
    case NATIVE_OUTCOME_GRAPH:
      return {
        type: NATIVE_OUTCOME_GRAPH,
        present: true,
        ...pickRecordFields(output, [
          "processed_count",
          "labeled_count",
          "skipped_count",
          "failed_count",
          "outcome_count",
        ]),
      };
    case NATIVE_EVALUATION_GRAPH:
      return {
        type: NATIVE_EVALUATION_GRAPH,
        present: true,
        ...pickRecordFields(output, [
          "report_id",
          "model_version",
          "recommendation",
          "persisted",
        ]),
      };
    case NATIVE_INSIGHT_EXPLORATION_GRAPH:
      return {
        type: NATIVE_INSIGHT_EXPLORATION_GRAPH,
        present: true,
        ...pickRecordFields(output, [
          "insight_id",
          "window",
          "react_step_count",
          "verification_status",
          "evidence_ref_count",
        ]),
      };
    default:
      return { type: "unknown", present: true };
  }
}

function toResumeHint(run: Stage1RunSummary): Stage1RunResumeHint {
  if (run.status === "interrupted") {
    return {
      resumable: true,
      reason: null,
      command: `runs resume ${run.run_id}`,
    };
  }
  return {
    resumable: false,
    reason: `Run status is ${run.status}.`,
    command: null,
  };
}

export class Stage1Runtime {
  private readonly store: Stage1CheckpointStore;

  private readonly langgraphCheckpointer: BaseCheckpointSaver;

  private readonly decisionGraphDeps?: DecisionGraphDeps;

  private readonly outcomeGraphDeps?: OutcomeGraphDeps;

  private readonly evaluationGraphDeps?: EvaluationGraphDeps;

  private readonly insightExplorationGraphDeps?: InsightExplorationGraphDeps;

  constructor(
    store?: Stage1CheckpointStore,
    options?: {
      langgraphCheckpointer?: BaseCheckpointSaver;
      decisionGraphDeps?: DecisionGraphDeps;
      outcomeGraphDeps?: OutcomeGraphDeps;
      evaluationGraphDeps?: EvaluationGraphDeps;
      insightExplorationGraphDeps?: InsightExplorationGraphDeps;
    },
  ) {
    this.store = store ?? new Stage1CheckpointStore();
    this.decisionGraphDeps = options?.decisionGraphDeps;
    this.outcomeGraphDeps = options?.outcomeGraphDeps;
    this.evaluationGraphDeps = options?.evaluationGraphDeps;
    this.insightExplorationGraphDeps = options?.insightExplorationGraphDeps;
    this.langgraphCheckpointer =
      options?.langgraphCheckpointer ??
      createLanggraphCheckpointer({
        dbPath: resolveLanggraphCheckpointDbPath(this.store.dbPath),
      });
  }

  startRun(options?: Stage1RuntimeStartOptions): Stage1RuntimeRunView {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const graphName = options?.graph_name ?? "stage1-foundation";
    const created = this.store.createRun({
      run_id: runId,
      graph_name: graphName,
      status: "queued",
      input: options?.input ?? {},
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "bootstrap",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "bootstrap",
      state: {
        stage: "bootstrap",
        graph_name: graphName,
        runtime: "@langchain/langgraph",
      },
    });

    if (options?.interrupt_after_bootstrap) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "bootstrap",
      });
      return this.showRun(runId);
    }

    this.finalizeRunSucceeded(runId, {
      resumed: false,
      from_node: "bootstrap",
    });
    return this.showRun(runId);
  }

  async runGraph<TInput extends Record<string, unknown>, TOutput>(
    options: Stage1RuntimeGraphOptions<TInput, TOutput>,
  ): Promise<Stage1RuntimeGraphResult<TOutput>> {
    logger.debug({ graph_name: options.graph_name }, "stage1Runtime.runGraph");
    if (isNativeDecisionGraphRun(options.graph_name)) {
      return this.runNativeDecisionGraph(
        options.input ?? ({} as TInput),
        {
          interrupt_before_execute: options.interrupt_before_execute,
        },
      ) as Promise<Stage1RuntimeGraphResult<TOutput>>;
    }

    if (isNativeOutcomeGraphRun(options.graph_name)) {
      return this.runNativeOutcomeGraph(
        options.input ?? ({} as TInput),
        {
          interrupt_before_execute: options.interrupt_before_execute,
        },
      ) as Promise<Stage1RuntimeGraphResult<TOutput>>;
    }

    if (isNativeEvaluationGraphRun(options.graph_name)) {
      return this.runNativeEvaluationGraph(
        options.input ?? ({} as TInput),
        {
          interrupt_before_execute: options.interrupt_before_execute,
        },
      ) as Promise<Stage1RuntimeGraphResult<TOutput>>;
    }

    if (isNativeInsightExplorationGraphRun(options.graph_name)) {
      return this.runNativeInsightExplorationGraph(
        options.input ?? ({} as TInput),
        {
          interrupt_before_execute: options.interrupt_before_execute,
        },
      ) as Promise<Stage1RuntimeGraphResult<TOutput>>;
    }

    const input = options.input ?? ({} as TInput);
    const nodeName = options.node_name ?? "execute";
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const created = this.store.createRun({
      run_id: runId,
      graph_name: options.graph_name,
      status: "queued",
      input,
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "bootstrap",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "bootstrap",
      state: {
        stage: "bootstrap",
        graph_name: options.graph_name,
        runtime: "@langchain/langgraph",
        input,
      },
    });

    if (options.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: nodeName,
      });
      this.store.appendCheckpoint({
        run_id: runId,
        node_name: "interrupt",
        state: {
          stage: "interrupt",
          next_node: nodeName,
        },
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    try {
      const output = await this.invokeGraphNode({
        run_id: runId,
        node_name: nodeName,
        input,
        execute: options.execute!,
      });
      this.finalizeRunSucceeded(runId, {
        resumed: false,
        from_node: nodeName,
        output,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  async runNativeDecisionGraph(
    input: Record<string, unknown>,
    options?: { interrupt_before_execute?: boolean },
  ): Promise<Stage1RuntimeGraphResult<DecisionGraphResult>> {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const boundedInput = toBoundedDecisionInput(input);
    const created = this.store.createRun({
      run_id: runId,
      graph_name: NATIVE_DECISION_GRAPH,
      status: "queued",
      thread_id: runId,
      checkpoint_ns: "",
      input: boundedInput,
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "normalize_input",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    if (options?.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "normalize_input",
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    try {
      const graph = buildDecisionGraph({
        deps: this.decisionGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const finalState = await graph.invoke(
        buildDecisionGraphInvokeState(runId, input),
        {
          configurable: { thread_id: runId },
        },
      );
      const output = stateToDecisionGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        runId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedDecisionOutput(output),
        latest_error: null,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  async runNativeOutcomeGraph(
    input: Record<string, unknown>,
    options?: { interrupt_before_execute?: boolean },
  ): Promise<Stage1RuntimeGraphResult<OutcomeGraphRunResult>> {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const boundedInput = toBoundedOutcomeInput(input);
    const created = this.store.createRun({
      run_id: runId,
      graph_name: NATIVE_OUTCOME_GRAPH,
      status: "queued",
      thread_id: runId,
      checkpoint_ns: "",
      input: boundedInput,
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "normalize_input",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    if (options?.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "normalize_input",
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    try {
      const graph = buildOutcomeGraph({
        deps: this.outcomeGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const limit =
        typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
          ? input.limit
          : 100;
      const finalState = await graph.invoke(
        {
          run_id: runId,
          thread_id: runId,
          now: typeof input.now === "string" ? input.now : undefined,
          limit,
          symbol: typeof input.symbol === "string" ? input.symbol.toUpperCase() : undefined,
        },
        {
          configurable: { thread_id: runId },
        },
      );
      const output = stateToOutcomeGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        runId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedOutcomeOutput(output),
        latest_error: null,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  async runNativeEvaluationGraph(
    input: Record<string, unknown>,
    options?: { interrupt_before_execute?: boolean },
  ): Promise<Stage1RuntimeGraphResult<EvaluationGraphRunResult>> {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const boundedInput = toBoundedEvaluationInput(input);
    const created = this.store.createRun({
      run_id: runId,
      graph_name: NATIVE_EVALUATION_GRAPH,
      status: "queued",
      thread_id: runId,
      checkpoint_ns: "",
      input: boundedInput,
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "normalize_input",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    if (options?.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "normalize_input",
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    try {
      const graph = buildEvaluationGraph({
        deps: this.evaluationGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const limit =
        typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
          ? input.limit
          : 500;
      const finalState = await graph.invoke(
        {
          run_id: runId,
          thread_id: runId,
          model_version:
            typeof input.model_version === "string" ? input.model_version : "stage1-v0",
          symbol: typeof input.symbol === "string" ? input.symbol.toUpperCase() : undefined,
          limit,
          persist: typeof input.persist === "boolean" ? input.persist : true,
        },
        {
          configurable: { thread_id: runId },
        },
      );
      const output = stateToEvaluationGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        runId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedEvaluationOutput(output),
        latest_error: null,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  async runNativeInsightExplorationGraph(
    input: Record<string, unknown>,
    options?: { interrupt_before_execute?: boolean },
  ): Promise<Stage1RuntimeGraphResult<InsightExplorationGraphResult>> {
    const runId = `run_${randomUUID().replace(/-/g, "")}`;
    const boundedInput = toBoundedInsightExplorationInput(input);
    const created = this.store.createRun({
      run_id: runId,
      graph_name: NATIVE_INSIGHT_EXPLORATION_GRAPH,
      status: "queued",
      thread_id: runId,
      checkpoint_ns: "",
      input: boundedInput,
    });

    this.store.updateRun(runId, {
      status: "running",
      current_node: "normalize_input",
      started_at: created.started_at ?? new Date().toISOString(),
      latest_error: null,
    });

    if (options?.interrupt_before_execute) {
      this.store.updateRun(runId, {
        status: "interrupted",
        current_node: "normalize_input",
      });
      return {
        run: this.showRun(runId),
        output: null,
      };
    }

    const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : "";
    const window = typeof input.window === "string" ? input.window : "";
    if (!symbol || !window) {
      this.markRunFailed(runId, "InsightExplorationGraph requires symbol and window");
      throw new Error("InsightExplorationGraph requires symbol and window");
    }

    try {
      const graph = buildInsightExplorationGraph({
        deps: this.insightExplorationGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const finalState = await graph.invoke(
        {
          run_id: runId,
          thread_id: runId,
          symbol,
          window,
          exploration_prompt:
            typeof input.exploration_prompt === "string" ? input.exploration_prompt : undefined,
          snapshot_limit:
            typeof input.snapshot_limit === "number" ? input.snapshot_limit : 20,
          outcome_limit: typeof input.outcome_limit === "number" ? input.outcome_limit : 200,
          persist: typeof input.persist === "boolean" ? input.persist : true,
        },
        {
          configurable: { thread_id: runId },
        },
      );
      const output = stateToInsightExplorationGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        runId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedInsightExplorationOutput(output),
        latest_error: null,
      });
      return {
        run: this.showRun(runId),
        output,
      };
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  listRuns(limit = 50): Stage1RunSummary[] {
    return this.store.listRuns(limit);
  }

  listRunMonitorSummaries(
    options: Stage1RunMonitorOptions = {},
  ): Stage1RunMonitorSummary[] {
    const limit = normalizeObservabilityLimit(options.limit);
    return this.store
      .listRuns(limit, {
        status: options.status,
        graph_name: options.graph_name,
      })
      .map((run) => {
        const checkpoints = isNativeLangGraphRegistryRun(run)
          ? []
          : this.store.listCheckpoints(run.run_id);
        return toRunMonitorSummary(run, checkpoints);
      });
  }

  showRunTraceDetail(runId: string): Stage1RunTraceDetail {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const checkpoints = isNativeLangGraphRegistryRun(run)
      ? []
      : this.store.listCheckpoints(runId);
    return {
      run: toRunMonitorSummary(run, checkpoints),
      checkpoints: checkpoints.map((checkpoint) => ({
        checkpoint_id: checkpoint.checkpoint_id,
        run_id: checkpoint.run_id,
        seq: checkpoint.seq,
        node_name: checkpoint.node_name,
        created_at: checkpoint.created_at,
        state_summary: toStateSummary(checkpoint.state),
      })),
      output_summary: toOutputSummary(run.graph_name, run.output),
      resume_hint: toResumeHint(run),
    };
  }

  showRun(runId: string): Stage1RuntimeRunView {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return {
      ...run,
      checkpoints: isNativeLangGraphRegistryRun(run)
        ? []
        : this.store.listCheckpoints(runId),
    };
  }

  async resumeRun(
    runId: string,
    handlers: Stage1RuntimeResumeHandlers = {},
  ): Promise<Stage1RuntimeRunView> {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (run.status !== "interrupted") {
      throw new Error(
        `Run ${runId} is not resumable; expected interrupted, got ${run.status}`,
      );
    }

    logger.info({ run_id: runId, graph_name: run.graph_name }, "stage1Runtime.resumeRun");
    if (isNativeLangGraphRegistryRun(run)) {
      if (isNativeDecisionGraphRun(run.graph_name)) {
        return this.resumeNativeDecisionGraph(runId, run);
      }
      if (isNativeOutcomeGraphRun(run.graph_name)) {
        return this.resumeNativeOutcomeGraph(runId, run);
      }
      if (isNativeEvaluationGraphRun(run.graph_name)) {
        return this.resumeNativeEvaluationGraph(runId, run);
      }
      if (isNativeInsightExplorationGraphRun(run.graph_name)) {
        return this.resumeNativeInsightExplorationGraph(runId, run);
      }
    }

    this.store.updateRun(runId, {
      status: "running",
      current_node: "resume",
      latest_error: null,
    });
    const latestCheckpoint = this.store.getLatestCheckpoint(runId);
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "resume",
      state: {
        stage: "resume",
        from_checkpoint: latestCheckpoint?.checkpoint_id ?? null,
        from_node: latestCheckpoint?.node_name ?? run.current_node,
      },
    });

    const handler = handlers[run.graph_name];
    if (handler) {
      try {
        const output = await this.invokeGraphNode({
          run_id: runId,
          node_name: "resume_execute",
          input: normalizeRunInput(run.input),
          execute: handler,
        });
        this.finalizeRunSucceeded(runId, {
          resumed: true,
          from_node: latestCheckpoint?.node_name ?? run.current_node,
          output,
        });
      } catch (error) {
        this.markRunFailed(runId, errorToMessage(error));
        throw error;
      }
      return this.showRun(runId);
    }

    if (run.graph_name !== "stage1-foundation") {
      this.markRunFailed(
        runId,
        `No resume handler registered for graph ${run.graph_name}`,
      );
      throw new Error(`No resume handler registered for graph ${run.graph_name}`);
    }

    this.finalizeRunSucceeded(runId, {
      resumed: true,
      from_node: latestCheckpoint?.node_name ?? run.current_node,
    });
    return this.showRun(runId);
  }

  private async resumeNativeDecisionGraph(
    runId: string,
    run: Stage1RunDetail,
  ): Promise<Stage1RuntimeRunView> {
    const threadId = run.thread_id ?? runId;
    const input = normalizeRunInput(run.input);
    this.store.updateRun(runId, {
      status: "running",
      current_node: run.current_node ?? "normalize_input",
      latest_error: null,
    });

    try {
      const graph = buildDecisionGraph({
        deps: this.decisionGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const checkpoint = await this.langgraphCheckpointer.getTuple({
        configurable: { thread_id: threadId },
      });
      const finalState = checkpoint
        ? await graph.invoke(null, {
          configurable: { thread_id: threadId },
        })
        : await graph.invoke(buildDecisionGraphInvokeState(runId, input), {
          configurable: { thread_id: threadId },
        });
      const output = stateToDecisionGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        threadId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedDecisionOutput(output),
        latest_error: null,
      });
      return this.showRun(runId);
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  private async resumeNativeOutcomeGraph(
    runId: string,
    run: Stage1RunDetail,
  ): Promise<Stage1RuntimeRunView> {
    const threadId = run.thread_id ?? runId;
    const input = normalizeRunInput(run.input);
    this.store.updateRun(runId, {
      status: "running",
      current_node: run.current_node ?? "normalize_input",
      latest_error: null,
    });

    try {
      const graph = buildOutcomeGraph({
        deps: this.outcomeGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const checkpoint = await this.langgraphCheckpointer.getTuple({
        configurable: { thread_id: threadId },
      });
      const limit =
        typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
          ? input.limit
          : 100;
      const finalState = checkpoint
        ? await graph.invoke(null, {
          configurable: { thread_id: threadId },
        })
        : await graph.invoke(
          {
            run_id: runId,
            thread_id: threadId,
            now: typeof input.now === "string" ? input.now : undefined,
            limit,
            symbol: typeof input.symbol === "string" ? input.symbol.toUpperCase() : undefined,
          },
          {
            configurable: { thread_id: threadId },
          },
        );
      const output = stateToOutcomeGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        threadId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedOutcomeOutput(output),
        latest_error: null,
      });
      return this.showRun(runId);
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  private async resumeNativeEvaluationGraph(
    runId: string,
    run: Stage1RunDetail,
  ): Promise<Stage1RuntimeRunView> {
    const threadId = run.thread_id ?? runId;
    const input = normalizeRunInput(run.input);
    this.store.updateRun(runId, {
      status: "running",
      current_node: run.current_node ?? "normalize_input",
      latest_error: null,
    });

    try {
      const graph = buildEvaluationGraph({
        deps: this.evaluationGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const checkpoint = await this.langgraphCheckpointer.getTuple({
        configurable: { thread_id: threadId },
      });
      const limit =
        typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
          ? input.limit
          : 500;
      const invokeInput = {
        run_id: runId,
        thread_id: threadId,
        model_version: typeof input.model_version === "string" ? input.model_version : "stage1-v0",
        symbol: typeof input.symbol === "string" ? input.symbol.toUpperCase() : undefined,
        limit,
        persist: typeof input.persist === "boolean" ? input.persist : true,
      };
      const finalState = checkpoint
        ? await graph.invoke(null, { configurable: { thread_id: threadId } })
        : await graph.invoke(invokeInput, { configurable: { thread_id: threadId } });
      const output = stateToEvaluationGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        threadId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedEvaluationOutput(output),
        latest_error: null,
      });
      return this.showRun(runId);
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  private async resumeNativeInsightExplorationGraph(
    runId: string,
    run: Stage1RunDetail,
  ): Promise<Stage1RuntimeRunView> {
    const threadId = run.thread_id ?? runId;
    const input = normalizeRunInput(run.input);
    this.store.updateRun(runId, {
      status: "running",
      current_node: run.current_node ?? "normalize_input",
      latest_error: null,
    });

    try {
      const graph = buildInsightExplorationGraph({
        deps: this.insightExplorationGraphDeps,
        checkpointer: this.langgraphCheckpointer,
      });
      const checkpoint = await this.langgraphCheckpointer.getTuple({
        configurable: { thread_id: threadId },
      });
      const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : "";
      const window = typeof input.window === "string" ? input.window : "";
      const invokeInput = {
        run_id: runId,
        thread_id: threadId,
        symbol,
        window,
        exploration_prompt:
          typeof input.exploration_prompt === "string" ? input.exploration_prompt : undefined,
        snapshot_limit: typeof input.snapshot_limit === "number" ? input.snapshot_limit : 20,
        outcome_limit: typeof input.outcome_limit === "number" ? input.outcome_limit : 200,
        persist: typeof input.persist === "boolean" ? input.persist : true,
      };
      const finalState = checkpoint
        ? await graph.invoke(null, { configurable: { thread_id: threadId } })
        : await graph.invoke(invokeInput, { configurable: { thread_id: threadId } });
      const output = stateToInsightExplorationGraphResult(finalState);
      const checkpointRef = await readLatestLanggraphCheckpointRef(
        this.langgraphCheckpointer,
        threadId,
      );
      this.store.updateRun(runId, {
        status: "succeeded",
        current_node: null,
        finished_at: new Date().toISOString(),
        checkpoint_ref: checkpointRef,
        output: toBoundedInsightExplorationOutput(output),
        latest_error: null,
      });
      return this.showRun(runId);
    } catch (error) {
      this.markRunFailed(runId, errorToMessage(error));
      throw error;
    }
  }

  markRunFailed(runId: string, error: string): Stage1RuntimeRunView {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    this.store.updateRun(runId, {
      status: "failed",
      latest_error: error,
      current_node: run.current_node,
      finished_at: new Date().toISOString(),
    });
    if (!isNativeLangGraphRegistryRun(run)) {
      this.store.appendCheckpoint({
        run_id: runId,
        node_name: "failed",
        state: { error },
      });
    }
    return this.showRun(runId);
  }

  close(): void {
    this.store.close();
    if ("db" in this.langgraphCheckpointer) {
      const sqliteSaver = this.langgraphCheckpointer as {
        db?: { close?: () => void };
      };
      sqliteSaver.db?.close?.();
    }
  }

  private finalizeRunSucceeded(
    runId: string,
    payload: { resumed: boolean; from_node: string | null; output?: unknown },
  ): void {
    const run = this.store.getRun(runId);
    if (run && isNativeLangGraphRegistryRun(run)) {
      return;
    }

    this.store.updateRun(runId, {
      status: "running",
      current_node: "complete",
    });
    this.store.appendCheckpoint({
      run_id: runId,
      node_name: "complete",
      state: {
        stage: "complete",
        resumed: payload.resumed,
        from_node: payload.from_node,
      },
    });
    this.store.updateRun(runId, {
      status: "succeeded",
      current_node: null,
      finished_at: new Date().toISOString(),
      output: payload.output ?? {
        ok: true,
        resumed: payload.resumed,
      },
      latest_error: null,
    });
  }

  private async invokeGraphNode<TInput extends Record<string, unknown>, TOutput>(
    params: {
      run_id: string;
      node_name: string;
      input: TInput;
      execute: Stage1RuntimeGraphExecutor<TInput, TOutput>;
    },
  ): Promise<TOutput> {
    this.store.updateRun(params.run_id, {
      status: "running",
      current_node: params.node_name,
    });
    this.store.appendCheckpoint({
      run_id: params.run_id,
      node_name: `${params.node_name}:start`,
      state: {
        stage: "node_start",
        node_name: params.node_name,
        input: params.input,
      },
    });

    const graph = new StateGraph(RuntimeGraphState)
      .addNode(params.node_name, async (state) => {
        const output = await params.execute({
          ...(state.input as TInput),
          run_id: state.run_id,
        });
        return { output };
      })
      .addEdge(START, params.node_name)
      .addEdge(params.node_name, END)
      .compile();
    const result = await graph.invoke({
      run_id: params.run_id,
      input: params.input,
      output: null,
    });
    const output = result.output as TOutput;

    this.store.appendCheckpoint({
      run_id: params.run_id,
      node_name: `${params.node_name}:complete`,
      state: {
        stage: "node_complete",
        node_name: params.node_name,
        output,
      },
    });
    return output;
  }
}

export function isRunStatus(value: unknown): value is Stage1RunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "interrupted" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  );
}
