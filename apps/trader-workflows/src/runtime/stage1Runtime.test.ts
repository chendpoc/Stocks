import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MemorySaver } from "@langchain/langgraph";

import { parseDecisionEnvelope } from "../llm/decisionEnvelope.js";
import type { ContextSnapshotRecord } from "../services/contextSnapshots.js";
import {
  computeOutcomeDueAt,
  OUTCOME_HORIZONS,
  type PersistedModelDecision,
  type ScheduledDecisionOutcome,
} from "../services/decisions.js";
import { Stage1CheckpointStore } from "./checkpointStore.js";
import { Stage1Runtime } from "./stage1Runtime.js";

const SAMPLE_SNAPSHOT: ContextSnapshotRecord = {
  snapshot_id: "snap-runtime-1",
  symbol: "TSLA",
  asof_ts: "2026-06-01T12:00:00Z",
  context_version: "stage1-context-v0",
  items_json: [
    {
      item_id: "signal:sig-1",
      source_type: "signal",
      evidence_ref: { ref_type: "intel_signal", ref_id: "sig-1", symbol: "TSLA" },
      summary: "Breakout signal",
      confidence: 0.8,
      relevance_weight: 0.95,
      freshness_weight: 1,
      source_quality_weight: 0.9,
      verification_status: "verified",
      composite_weight: 0.7,
    },
  ],
  evidence_refs_json: [{ ref_type: "intel_signal", ref_id: "sig-1", symbol: "TSLA" }],
  weighting_policy_version: "stage1-v0",
  context_hash: "hash-runtime",
};

function createTempCheckpointDbPath(): { tempDir: string; dbPath: string } {
  const tempDir = mkdtempSync(resolve(tmpdir(), "stage1-runtime-"));
  return {
    tempDir,
    dbPath: resolve(tempDir, "checkpoints.sqlite"),
  };
}

function createStubDecisionGraphRuntime(dbPath: string): Stage1Runtime {
  const envelope = parseDecisionEnvelope({
    symbol: "TSLA.US",
    action: "NO_TRADE",
    thesis: "No edge",
    confidence: 0.4,
  });
  const asof = "2026-06-01T12:00:00.000Z";

  return new Stage1Runtime(new Stage1CheckpointStore({ dbPath }), {
    langgraphCheckpointer: new MemorySaver(),
    decisionGraphDeps: {
      buildContext: async () => SAMPLE_SNAPSHOT,
      llm: {
        async generateDecisionEnvelope() {
          return envelope;
        },
        async generateInsightProposal() {
          throw new Error("not used");
        },
      },
      persistDecision: async (input) => ({
        decision_id: "dec-runtime-1",
        run_id: input.run_id ?? null,
        snapshot_id: input.snapshot_id,
        symbol: input.envelope.symbol,
        action: input.envelope.action.toLowerCase(),
        confidence: input.envelope.confidence,
        uncertainty: input.envelope.uncertainty ?? null,
        decision_json: JSON.stringify(input.envelope),
        status: "active",
      }),
      scheduleOutcomes: async (input) =>
        OUTCOME_HORIZONS.map((horizon, index) => ({
          outcome_id: `out-runtime-${index}`,
          decision_id: input.decision_id,
          symbol: input.symbol,
          horizon,
          path: "model_path",
          status: "pending",
          due_at: input.asof_ts ? computeOutcomeDueAt(horizon, input.asof_ts) : null,
        })),
    },
  });
}

test("Stage1 runtime uses temporary checkpoint DB and keeps market_intel untouched", async () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
  const marketIntelPath = resolve(repoRoot, "data/market_intel.db");
  const beforeMtime = existsSync(marketIntelPath)
    ? statSync(marketIntelPath).mtimeMs
    : null;

  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const store = new Stage1CheckpointStore({ dbPath });
  const runtime = new Stage1Runtime(store, {
    langgraphCheckpointer: new MemorySaver(),
  });

  try {
    const interrupted = runtime.startRun({
      graph_name: "DecisionGraph",
      input: { symbol: "TSLA.US" },
      interrupt_after_bootstrap: true,
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(resolve(store.dbPath), resolve(dbPath));
    assert.notEqual(resolve(store.dbPath), resolve(marketIntelPath));

    const resumed = await runtime.resumeRun(interrupted.run_id, {
      DecisionGraph: async (input) => ({ run_id: input.run_id, resumed: true }),
    });
    assert.equal(resumed.status, "succeeded");
    assert.ok(resumed.checkpoints.length >= 2);
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  if (beforeMtime !== null && existsSync(marketIntelPath)) {
    const afterMtime = statSync(marketIntelPath).mtimeMs;
    assert.equal(afterMtime, beforeMtime);
  }
});

test("Stage1 runtime supports runs list/show/resume primitives", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = new Stage1Runtime(new Stage1CheckpointStore({ dbPath }), {
    langgraphCheckpointer: new MemorySaver(),
  });

  try {
    const interrupted = runtime.startRun({
      graph_name: "OutcomeGraph",
      interrupt_after_bootstrap: true,
    });
    const completed = runtime.startRun({ graph_name: "EvaluationGraph" });

    const listed = runtime.listRuns(10);
    assert.ok(listed.some((run) => run.run_id === interrupted.run_id));
    assert.ok(listed.some((run) => run.run_id === completed.run_id));

    const shown = runtime.showRun(interrupted.run_id);
    assert.equal(shown.status, "interrupted");
    assert.equal(shown.graph_name, "OutcomeGraph");
    assert.ok(shown.checkpoints.length >= 1);

    const resumed = await runtime.resumeRun(interrupted.run_id, {
      OutcomeGraph: async (input) => ({ run_id: input.run_id, resumed: true }),
    });
    assert.equal(resumed.status, "succeeded");
    assert.ok(resumed.checkpoints.some((cp) => cp.node_name === "complete"));

    await assert.rejects(
      () => runtime.resumeRun(completed.run_id),
      /not resumable; expected interrupted/,
    );
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Stage1 runtime exposes bounded run monitor summaries with filters", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = new Stage1Runtime(new Stage1CheckpointStore({ dbPath }), {
    langgraphCheckpointer: new MemorySaver(),
  });

  try {
    const interrupted = runtime.startRun({
      graph_name: "OutcomeGraph",
      input: { symbol: "TSLA", secret: "must-not-leak" },
      interrupt_after_bootstrap: true,
    });
    await runtime.runGraph({
      graph_name: "LegacyTestGraph",
      node_name: "legacy_execute",
      input: { symbol: "NVDA", secret: "must-not-leak" },
      execute: async (input) => ({
        run_id: input.run_id,
        symbol: input.symbol,
        ok: true,
      }),
    });

    const summaries = runtime.listRunMonitorSummaries({
      status: "interrupted",
      graph_name: "OutcomeGraph",
      limit: 5,
    });

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].run_id, interrupted.run_id);
    assert.equal(summaries[0].graph_name, "OutcomeGraph");
    assert.equal(summaries[0].status, "interrupted");
    assert.equal(summaries[0].current_node, "bootstrap");
    assert.equal(summaries[0].checkpoint_count, 1);
    assert.equal(summaries[0].latest_checkpoint_ref, interrupted.checkpoint_ref);
    assert.equal(summaries[0].has_error, false);
    assert.equal(summaries[0].latest_error, null);
    assert.equal(summaries[0].resumable, true);
    assert.equal(typeof summaries[0].duration_ms, "number");
    assert.equal("input" in summaries[0], false);
    assert.equal("output" in summaries[0], false);
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Stage1 runtime exposes bounded run trace details without raw state", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = new Stage1Runtime(new Stage1CheckpointStore({ dbPath }), {
    langgraphCheckpointer: new MemorySaver(),
  });

  try {
    const executed = await runtime.runGraph({
      graph_name: "LegacyTestGraph",
      node_name: "legacy_execute",
      input: { symbol: "TSLA", secret: "must-not-leak" },
      execute: async (input) => ({
        run_id: input.run_id,
        symbol: input.symbol,
        secret: "must-not-leak",
        ok: true,
      }),
    });

    const detail = runtime.showRunTraceDetail(executed.run.run_id);

    assert.equal(detail.run.run_id, executed.run.run_id);
    assert.equal(detail.run.graph_name, "LegacyTestGraph");
    assert.equal(detail.run.status, "succeeded");
    assert.equal(detail.checkpoints.length, 4);
    assert.deepEqual(
      detail.checkpoints.map((checkpoint) => checkpoint.seq),
      [1, 2, 3, 4],
    );
    assert.ok(
      detail.checkpoints.every((checkpoint) => !("state" in checkpoint)),
    );
    assert.equal(JSON.stringify(detail.checkpoints).includes("must-not-leak"), false);
    assert.deepEqual(detail.output_summary, {
      type: "unknown",
      present: true,
    });
    assert.deepEqual(detail.resume_hint, {
      resumable: false,
      reason: "Run status is succeeded.",
      command: null,
    });
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("native DecisionGraph run registry uses thread_id = run_id and bounded metadata", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = createStubDecisionGraphRuntime(dbPath);

  try {
    const executed = await runtime.runGraph({
      graph_name: "DecisionGraph",
      node_name: "decision",
      input: { symbol: "TSLA.US", asof_ts: "2026-06-01T12:00:00.000Z" },
      execute: async () => {
        throw new Error("native DecisionGraph must not use legacy execute callback");
      },
    });

    assert.equal(executed.run.status, "succeeded");
    assert.equal(executed.run.graph_name, "DecisionGraph");
    assert.equal(executed.run.thread_id, executed.run.run_id);
    assert.equal(executed.output?.run_id, executed.run.run_id);
    assert.deepEqual(executed.run.output, {
      snapshot_id: "snap-runtime-1",
      decision_id: "dec-runtime-1",
      action: "NO_TRADE",
      scheduled_outcome_count: OUTCOME_HORIZONS.length,
      paper_execution_submitted: false,
      context_snapshot: {
        snapshot_id: "snap-runtime-1",
        context_hash: "hash-runtime",
        context_version: "stage1-context-v0",
        item_count: 1,
        evidence_ref_count: 1,
        source_type_counts: { signal: 1 },
      },
    });

    const shown = runtime.showRun(executed.run.run_id);
    assert.equal(shown.status, "succeeded");
    assert.equal(shown.thread_id, shown.run_id);
    assert.equal(shown.checkpoints.length, 0);
    assert.ok(
      shown.checkpoint_ref === null || typeof shown.checkpoint_ref === "string",
    );
    assert.equal(typeof shown.output, "object");
    assert.equal((shown.output as { action?: string }).action, "NO_TRADE");
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("native DecisionGraph interruption can resume through LangGraph checkpoint path", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = createStubDecisionGraphRuntime(dbPath);

  try {
    const interrupted = await runtime.runGraph({
      graph_name: "DecisionGraph",
      node_name: "decision",
      input: { symbol: "TSLA.US", asof_ts: "2026-06-01T12:00:00.000Z" },
      interrupt_before_execute: true,
      execute: async () => {
        throw new Error("should not execute before interruption");
      },
    });

    assert.equal(interrupted.run.status, "interrupted");
    assert.equal(interrupted.run.thread_id, interrupted.run.run_id);

    const resumed = await runtime.resumeRun(interrupted.run.run_id);

    assert.equal(resumed.status, "succeeded");
    assert.equal(resumed.thread_id, interrupted.run.run_id);
    assert.deepEqual(resumed.output, {
      snapshot_id: "snap-runtime-1",
      decision_id: "dec-runtime-1",
      action: "NO_TRADE",
      scheduled_outcome_count: OUTCOME_HORIZONS.length,
      paper_execution_submitted: false,
      context_snapshot: {
        snapshot_id: "snap-runtime-1",
        context_hash: "hash-runtime",
        context_version: "stage1-context-v0",
        item_count: 1,
        evidence_ref_count: 1,
        source_type_counts: { signal: 1 },
      },
    });
    assert.equal(resumed.checkpoints.length, 0);
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Stage1 runtime wraps non-native graph execution in run metadata and checkpoints", async () => {
  const { tempDir, dbPath } = createTempCheckpointDbPath();
  const runtime = new Stage1Runtime(new Stage1CheckpointStore({ dbPath }), {
    langgraphCheckpointer: new MemorySaver(),
  });

  try {
    const executed = await runtime.runGraph({
      graph_name: "LegacyTestGraph",
      node_name: "legacy_execute",
      input: { symbol: "TSLA.US" },
      execute: async (input) => ({
        run_id: input.run_id,
        symbol: input.symbol,
        ok: true,
      }),
    });

    assert.equal(executed.run.status, "succeeded");
    assert.equal(executed.run.graph_name, "LegacyTestGraph");
    assert.equal(executed.output?.run_id, executed.run.run_id);
    assert.deepEqual(executed.run.output, executed.output);

    const shown = runtime.showRun(executed.run.run_id);
    assert.equal(shown.status, "succeeded");
    assert.ok(shown.checkpoint_ref);
    assert.ok(shown.checkpoints.some((cp) => cp.node_name === "bootstrap"));
    assert.ok(
      shown.checkpoints.some((cp) => cp.node_name === "legacy_execute:start"),
    );
    assert.ok(
      shown.checkpoints.some((cp) => cp.node_name === "legacy_execute:complete"),
    );
    assert.ok(shown.checkpoints.some((cp) => cp.node_name === "complete"));
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
