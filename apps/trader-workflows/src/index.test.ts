import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { handleCommandAsync } from "./index.js";
import { Stage1CheckpointStore } from "./runtime/checkpointStore.js";
import { Stage1Runtime } from "./runtime/stage1Runtime.js";
import {
  buildContextSnapshotPayload,
  weightedItemsFromIntelBuild,
  type IntelContextBuildResponse,
} from "./services/contextSnapshots.js";

const SAMPLE_BUILD: IntelContextBuildResponse = {
  signals: [
    {
      signal_id: "sig-cli-1",
      symbol: "TSLA",
      ts: "2026-06-01T12:00:00Z",
      signal_type: "breakout",
      severity: 0.8,
    },
  ],
};

function createRuntime(): { runtime: Stage1Runtime; tempDir: string } {
  const tempDir = mkdtempSync(resolve(tmpdir(), "workflow-cli-"));
  const dbPath = resolve(tempDir, "checkpoints.sqlite");
  return {
    runtime: new Stage1Runtime(new Stage1CheckpointStore({ dbPath })),
    tempDir,
  };
}

test("context snapshots list/show commands return bounded read-only envelopes", async () => {
  const { runtime, tempDir } = createRuntime();
  const payload = buildContextSnapshotPayload({
    symbol: "TSLA",
    items: weightedItemsFromIntelBuild(SAMPLE_BUILD, "TSLA", "2026-06-01T12:00:00Z"),
    asof_ts: "2026-06-01T12:00:00Z",
    snapshot_id: "snap-cli-1",
  });
  const record = { ...payload, created_at: "2026-06-01T12:00:01Z" };
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, method: options.method ?? "GET" });
    if (url.endsWith("/stage1/context-snapshots?symbol=TSLA&limit=2")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [record], count: 1 }),
      } as Response;
    }
    if (url.endsWith("/stage1/context-snapshots/snap-cli-1")) {
      return {
        ok: true,
        status: 200,
        json: async () => record,
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => `unexpected ${url}`,
    } as Response;
  }) as typeof fetch;

  try {
    const list = await handleCommandAsync(runtime, [
      "context",
      "snapshots",
      "list",
      "--symbol",
      "tsla",
      "--limit",
      "2",
    ]);
    const show = await handleCommandAsync(runtime, [
      "context",
      "snapshots",
      "show",
      "snap-cli-1",
    ]);

    assert.equal(list.ok, true);
    assert.equal(list.command, "context snapshots list");
    assert.deepEqual(list.error, null);
    assert.equal((list.data?.snapshots as unknown[]).length, 1);
    assert.equal(show.ok, true);
    assert.equal(show.command, "context snapshots show");
    assert.deepEqual(show.error, null);
    assert.equal(show.data?.snapshot_id, "snap-cli-1");
    assert.equal(Array.isArray(show.data?.top_items), true);
    assert.deepEqual(
      calls.map((call) => call.method),
      ["GET", "GET"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("runs monitor/trace commands return bounded observability envelopes", async () => {
  const { runtime, tempDir } = createRuntime();

  try {
    const interrupted = runtime.startRun({
      graph_name: "OutcomeGraph",
      input: { symbol: "TSLA", secret: "must-not-leak" },
      interrupt_after_bootstrap: true,
    });
    const executed = await runtime.runGraph({
      graph_name: "LegacyTestGraph",
      node_name: "legacy_execute",
      input: { symbol: "NVDA", secret: "must-not-leak" },
      execute: async (input) => ({
        run_id: input.run_id,
        symbol: input.symbol,
        secret: "must-not-leak",
        ok: true,
      }),
    });

    const monitor = await handleCommandAsync(runtime, [
      "runs",
      "monitor",
      "--status",
      "interrupted",
      "--graph-name",
      "OutcomeGraph",
      "--limit",
      "999",
    ]);
    const trace = await handleCommandAsync(runtime, [
      "runs",
      "trace",
      executed.run.run_id,
    ]);

    assert.equal(monitor.ok, true);
    assert.equal(monitor.command, "runs monitor");
    assert.equal(monitor.error, null);
    const runs = monitor.data?.runs as Array<Record<string, unknown>>;
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_id, interrupted.run_id);
    assert.equal(runs[0].resumable, true);
    assert.equal("input" in runs[0], false);
    assert.equal("output" in runs[0], false);
    assert.deepEqual(monitor.data?.filters, {
      status: "interrupted",
      graph_name: "OutcomeGraph",
      limit: 200,
    });

    assert.equal(trace.ok, true);
    assert.equal(trace.command, "runs trace");
    assert.equal(trace.run_id, executed.run.run_id);
    assert.equal(trace.status, "succeeded");
    assert.equal(trace.error, null);
    assert.equal(JSON.stringify(trace.data).includes("must-not-leak"), false);
    assert.deepEqual(trace.data?.output_summary, {
      type: "unknown",
      present: true,
    });
    assert.deepEqual(trace.data?.resume_hint, {
      resumable: false,
      reason: "Run status is succeeded.",
      command: null,
    });
  } finally {
    runtime.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
