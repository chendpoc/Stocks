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
} from "./services/contextSnapshots.js";
import type { IntelContextBuildResponse } from "./types/context.js";

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

test("outcomes list and insights list expose read-only envelopes", async () => {
  const runtime = {} as Stage1Runtime;
  const outcomeCalls: string[] = [];
  const insightCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:8000/api/intel/stage1/decision-outcomes")) {
      outcomeCalls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              outcome_id: "out-1",
              decision_id: "dec-1",
              symbol: "TSLA",
              horizon: "2h",
              path: "rule",
              status: "pending",
              due_at: null,
              scheduled_at: null,
              label: null,
              created_at: "2026-06-01T10:00:00Z",
            },
          ],
          count: 1,
        }),
      } as Response;
    }
    if (url.startsWith("http://127.0.0.1:8000/api/intel/stage1/insight-candidates")) {
      insightCalls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              insight_id: "ins-1",
              thesis: "test insight",
              symbols_json: ["TSLA"],
              window_start: "2026-06-01T00:00:00Z",
              window_end: "2026-06-01T01:00:00Z",
              run_id: null,
              evidence_refs_json: [],
              verification_status: "pending",
              weight_cap: 0.5,
              candidate_json: {},
              created_at: "2026-06-01T01:00:00Z",
            },
          ],
          count: 1,
        }),
      } as Response;
    }
    return {
      ok: false,
      status: 500,
      text: async () => `unexpected ${url}`,
    } as Response;
  }) as typeof fetch;

  try {
    const outcomes = await handleCommandAsync(runtime, [
      "outcomes",
      "list",
      "--symbol",
      "tsla",
      "--status",
      "pending",
      "--limit",
      "2",
    ]);
    const insights = await handleCommandAsync(runtime, [
      "insights",
      "list",
      "--symbol",
      "tsla",
      "--verification-status",
      "pending",
      "--limit",
      "3",
    ]);

    assert.equal(outcomes.ok, true);
    assert.equal(outcomes.command, "outcomes list");
    assert.equal(Array.isArray(outcomes.data?.outcomes), true);
    assert.equal(outcomes.data?.count, 1);
    assert.equal((outcomes.data?.outcomes as Array<{ outcome_id: string }>)[0].outcome_id, "out-1");

    assert.equal(insights.ok, true);
    assert.equal(insights.command, "insights list");
    assert.equal(Array.isArray(insights.data?.insight_candidates), true);
    assert.equal(insights.data?.count, 1);
    assert.equal(
      (insights.data?.insight_candidates as Array<{ insight_id: string }>)[0].insight_id,
      "ins-1",
    );

    assert.equal(outcomeCalls.length, 1);
    assert.equal(
      outcomeCalls[0],
      "http://127.0.0.1:8000/api/intel/stage1/decision-outcomes?symbol=TSLA&status=pending&limit=2",
    );
    assert.equal(insightCalls.length, 1);
    assert.equal(
      insightCalls[0],
      "http://127.0.0.1:8000/api/intel/stage1/insight-candidates?symbol=TSLA&verification_status=pending&limit=3",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("outcomes run / eval summary / insights explore still dispatch through runGraph", async () => {
  const runCalls: Array<{ graph_name: string; input: Record<string, unknown> }> = [];
  const runtime = {
    runGraph: async (input: { graph_name: string; input: Record<string, unknown> }) => {
      runCalls.push(input);
      switch (input.graph_name) {
        case "OutcomeGraph":
          return {
            run: { run_id: "run-outcome", status: "succeeded" },
            output: {
              processed_count: 1,
              labeled_count: 1,
              skipped_count: 0,
              failed_count: 0,
              counts_by_source_type: { decision: 1 },
              counts_by_normalized_label: { hit: 1 },
              outcomes: [{ outcome_id: "out-1" }],
            },
          };
        case "EvaluationGraph":
          return {
            run: { run_id: "run-eval", status: "succeeded" },
            output: {
              report: {
                report_id: "rpt-1",
                model_version: "stage1-v0",
                window_start: "2026-06-01T00:00:00Z",
                window_end: "2026-06-01T01:00:00Z",
                recommendation: "monitor",
                metrics_json: {},
                sections: {},
                report_json: {},
              },
              persisted_report: {},
            },
          };
        case "InsightExplorationGraph":
          return {
            run: { run_id: "run-insight", status: "succeeded" },
            output: {
              insight_id: "ins-1",
              window: {
                window: "1d",
                window_start: "2026-06-01T00:00:00Z",
                window_end: "2026-06-01T01:00:00Z",
              },
              react_steps: [],
              persisted_candidate: { verification_status: "pending" },
              proposal: { weight_cap: 0.5, thesis: "thesis", evidence_refs: [] },
              scheduled_outcome: { outcome_id: "out-1", horizon: "2h" },
            },
          };
        default:
          throw new Error(`unsupported graph ${input.graph_name}`);
      }
    },
    close: () => { },
  } as unknown as Stage1Runtime;

  const outcomesRun = await handleCommandAsync(runtime, [
    "outcomes",
    "run",
    "--due",
    "--limit",
    "4",
  ]);
  const evalSummary = await handleCommandAsync(runtime, [
    "eval",
    "summary",
    "--symbol",
    "tsla",
    "--limit",
    "4",
  ]);
  const insightExplore = await handleCommandAsync(runtime, [
    "insights",
    "explore",
    "--symbol",
    "tsla",
    "--window",
    "1d",
  ]);

  assert.deepEqual(runCalls.map((call) => call.graph_name), [
    "OutcomeGraph",
    "EvaluationGraph",
    "InsightExplorationGraph",
  ]);
  assert.equal(outcomesRun.command, "outcomes run --due");
  assert.equal(evalSummary.command, "eval summary");
  assert.equal(insightExplore.command, "insights explore");
});

test("context bootstrap/latest/pattern-memory/failure-memory commands return expected envelopes", async () => {
  const runtime = {} as Stage1Runtime;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    const url = String(input);
    const method = options.method ?? "GET";
    calls.push({ url, method, body: options.body ? `${options.body}` : undefined });

    if (url === "http://127.0.0.1:8000/api/intel/market-agent/context/bootstrap") {
      if (method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session_context_pack_id: "pack-bootstrap",
            session_id: "profile-x",
            symbol: "TSLA",
            markdown: "ctx",
          }),
        } as Response;
      }
    }
    if (url === "http://127.0.0.1:8000/api/intel/market-agent/context/latest?session_id=profile-x&symbol=TSLA") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_context_pack_id: "pack-latest",
          session_id: "profile-x",
          symbol: "TSLA",
          markdown: "latest",
        }),
      } as Response;
    }
    if (url === "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory?symbol=TSLA&pattern_id=p-acc&status=active&limit=3") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ pattern_memory_id: "pm-1", symbol: "TSLA", pattern_id: "p-acc", memory_json: {} }],
          count: 1,
        }),
      } as Response;
    }
    if (url === "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/promote") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          item: { pattern_memory_id: "pm-1", symbol: "TSLA", pattern_id: "p-acc", memory_json: {} },
        }),
      } as Response;
    }
    if (url === "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/degrade") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          item: { pattern_memory_id: "pm-1", symbol: "TSLA", pattern_id: "p-acc", memory_json: {} },
        }),
      } as Response;
    }
    if (url === "http://127.0.0.1:8000/api/intel/market-agent/failure-memory?symbol=AAPL&failure_type=timeout&status=active&limit=4") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ failure_memory_id: "fm-1", symbol: "AAPL", failure_type: "timeout" }],
          count: 1,
        }),
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => `unexpected ${url}`,
    } as Response;
  }) as typeof fetch;

  try {
    const bootstrap = await handleCommandAsync(runtime, [
      "context",
      "bootstrap",
      "--profile",
      "profile-x",
      "--symbol",
      "tsla",
      "--max-chars",
      "160",
    ]);
    const latest = await handleCommandAsync(runtime, [
      "context",
      "latest",
      "--profile",
      "profile-x",
      "--symbol",
      "tsla",
    ]);
    const patternList = await handleCommandAsync(runtime, [
      "pattern-memory",
      "list",
      "--symbol",
      "tsla",
      "--pattern-id",
      "p-acc",
      "--status",
      "active",
      "--limit",
      "3",
    ]);
    const patternPromote = await handleCommandAsync(runtime, [
      "pattern-memory",
      "promote",
      "--candidate-id",
      "cand-1",
      "--confirm",
    ]);
    const patternDegrade = await handleCommandAsync(runtime, [
      "pattern-memory",
      "degrade",
      "--pattern-id",
      "p-acc",
      "--reason",
      "drift",
    ]);
    const failureList = await handleCommandAsync(runtime, [
      "failure-memory",
      "list",
      "--symbol",
      "aapl",
      "--type",
      "timeout",
      "--status",
      "active",
      "--limit",
      "4",
    ]);

    assert.equal(bootstrap.ok, true);
    assert.equal(bootstrap.command, "context bootstrap");
    assert.deepEqual(bootstrap.data?.context_pack, {
      session_context_pack_id: "pack-bootstrap",
      session_id: "profile-x",
      symbol: "TSLA",
      markdown: "ctx",
    });
    assert.equal(typeof bootstrap.data?.path, "string");
    assert.match(String(bootstrap.data?.path), /context_pack\.md$/);

    assert.equal(latest.ok, true);
    assert.equal(latest.command, "context latest");

    assert.equal(patternList.ok, true);
    assert.equal(patternList.command, "pattern-memory list");
    assert.equal(patternList.data?.count, 1);
    assert.deepEqual((patternList.data?.pattern_memories as Array<{ pattern_memory_id: string }>)[0].pattern_memory_id, "pm-1");

    assert.equal(patternPromote.ok, true);
    assert.equal(patternPromote.command, "pattern-memory promote");
    assert.equal(patternDegrade.ok, true);
    assert.equal(patternDegrade.command, "pattern-memory degrade");
    assert.equal(failureList.command, "failure-memory list");
    assert.equal(failureList.data?.count, 1);

    const bootstrapCall = calls.find((entry) => entry.url === "http://127.0.0.1:8000/api/intel/market-agent/context/bootstrap");
    assert.equal(bootstrapCall?.method, "POST");
    assert.equal(bootstrapCall?.body, '{"session_id":"profile-x","symbol":"TSLA","max_chars":160}');
    assert.equal(calls.filter((entry) => entry.url === "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/promote")[0].method, "POST");
    assert.equal(calls.filter((entry) => entry.url === "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/degrade")[0].method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pattern-memory promote requires confirm before network I/O", async () => {
  const runtime = {} as Stage1Runtime;
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return {
      ok: false,
      status: 500,
      text: async () => "should not be called",
    } as Response;
  }) as typeof fetch;

  try {
    let error: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "pattern-memory",
        "promote",
        "--candidate-id",
        "cand-1",
      ]);
    } catch (thrown) {
      error = thrown as { code: string };
    }
    assert.ok(error);
    assert.equal(error?.code, "CONFIRM_REQUIRED");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pattern-memory promote/degrade rejects mutually exclusive identifiers pre-network", async () => {
  const runtime = {} as Stage1Runtime;
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return {
      ok: false,
      status: 500,
      text: async () => "should not be called",
    } as Response;
  }) as typeof fetch;

  try {
    let promoteError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "pattern-memory",
        "promote",
        "--pattern-memory-id",
        "pm-1",
        "--candidate-id",
        "cand-1",
        "--confirm",
      ]);
    } catch (thrown) {
      promoteError = thrown as { code: string };
    }

    let degradeError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "pattern-memory",
        "degrade",
        "--pattern-memory-id",
        "pm-1",
        "--pattern-id",
        "p-acc",
      ]);
    } catch (thrown) {
      degradeError = thrown as { code: string };
    }

    assert.ok(promoteError);
    assert.equal(promoteError?.code, "PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE");
    assert.ok(degradeError);
    assert.equal(degradeError?.code, "PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("market-monitor/data commands fail pre-network when required args missing", async () => {
  const runtime = {} as Stage1Runtime;
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return {
      ok: false,
      status: 500,
      text: async () => "should not be called",
    } as Response;
  }) as typeof fetch;

  try {
    let missingSymbolsError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-monitor",
        "run",
        "--timeframes",
        "1d",
      ]);
    } catch (thrown) {
      missingSymbolsError = thrown as { code: string };
    }
    let missingTimeframesError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-monitor",
        "run",
        "--symbols",
        "tsla",
      ]);
    } catch (thrown) {
      missingTimeframesError = thrown as { code: string };
    }
    let missingMarketDataSymbolError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-data",
        "fetch",
        "--limit",
        "10",
      ]);
    } catch (thrown) {
      missingMarketDataSymbolError = thrown as { code: string };
    }
    let missingQualitySymbolError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-data",
        "quality",
        "--limit",
        "10",
      ]);
    } catch (thrown) {
      missingQualitySymbolError = thrown as { code: string };
    }
    let malformedMarketMonitorSymbolsError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-monitor",
        "run",
        "--symbols",
        "--timeframes",
        "1d",
      ]);
    } catch (thrown) {
      malformedMarketMonitorSymbolsError = thrown as { code: string };
    }
    let malformedMarketDataSymbolError: { code: string } | undefined;
    try {
      await handleCommandAsync(runtime, [
        "market-data",
        "fetch",
        "--symbol",
        "--limit",
        "10",
      ]);
    } catch (thrown) {
      malformedMarketDataSymbolError = thrown as { code: string };
    }

    assert.ok(missingSymbolsError);
    assert.ok(missingTimeframesError);
    assert.ok(missingMarketDataSymbolError);
    assert.ok(missingQualitySymbolError);
    assert.ok(malformedMarketMonitorSymbolsError);
    assert.ok(malformedMarketDataSymbolError);
    assert.equal(missingSymbolsError?.code, "SYMBOLS_REQUIRED");
    assert.equal(missingTimeframesError?.code, "TIMEFRAMES_REQUIRED");
    assert.equal(missingMarketDataSymbolError?.code, "SYMBOL_REQUIRED");
    assert.equal(missingQualitySymbolError?.code, "SYMBOL_REQUIRED");
    assert.equal(malformedMarketMonitorSymbolsError?.code, "SYMBOLS_VALUE_REQUIRED");
    assert.equal(malformedMarketDataSymbolError?.code, "SYMBOL_VALUE_REQUIRED");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("market-agent memory/decisions/monitor/data commands return expected envelopes and contracts", async () => {
  const runtime = {} as Stage1Runtime;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    const url = String(input);
    const method = options.method ?? "GET";
    calls.push({ url, method, body: options.body ? `${options.body}` : undefined });

    if (
      url === "http://127.0.0.1:8000/api/intel/market-agent/memory/init" &&
      method === "POST"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", table_names: [] }),
      } as Response;
    }
    if (
      url ===
      "http://127.0.0.1:8000/api/intel/stage1/model-decisions?symbol=TSLA&model_version=stage1-v0&limit=5" &&
      method === "GET"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ decision_id: "dec-1", symbol: "TSLA" }], count: 1 }),
      } as Response;
    }
    if (
      url === "http://127.0.0.1:8000/api/intel/market-agent/market-monitor/run" &&
      method === "POST"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: [{ status: "ok" }], count: 1 }),
      } as Response;
    }
    if (
      url ===
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/fetch?symbol=TSLA&timeframe=1d&limit=9&allow_live_fallback=true" &&
      method === "GET"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          symbol: "TSLA",
          timeframe: "1d",
          bars: [],
          quality_status: "pass",
          quality_reason: "ok",
          bar_count: 10,
          source: "db",
        }),
      } as Response;
    }
    if (
      url ===
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/health?symbol=TSLA" &&
      method === "GET"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", detail: "healthy" }),
      } as Response;
    }
    if (
      url ===
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/quality?symbol=TSLA&timeframe=1d&limit=3" &&
      method === "GET"
    ) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "pass",
          reason: "ok",
          bar_count: 20,
          min_required: 3,
        }),
      } as Response;
    }
    return {
      ok: false,
      status: 404,
      text: async () => `unexpected ${url}`,
    } as Response;
  }) as typeof fetch;

  try {
    const memory = await handleCommandAsync(runtime, ["memory", "init"]);
    const decisions = await handleCommandAsync(runtime, [
      "decisions",
      "list",
      "--symbol",
      "tsla",
      "--model-version",
      "stage1-v0",
      "--limit",
      "5",
    ]);
    const monitor = await handleCommandAsync(runtime, [
      "market-monitor",
      "run",
      "--symbols",
      "tsla",
      "--timeframes",
      "1d",
      "--limit",
      "7",
      "--allow-live-fallback",
    ]);
    const marketDataFetch = await handleCommandAsync(runtime, [
      "market-data",
      "fetch",
      "--symbol",
      "tsla",
      "--limit",
      "9",
      "--allow-live-fallback",
    ]);
    const marketDataHealth = await handleCommandAsync(runtime, [
      "market-data",
      "health",
      "--symbol",
      "tsla",
    ]);
    const marketDataQuality = await handleCommandAsync(runtime, [
      "market-data",
      "quality",
      "--symbol",
      "tsla",
      "--limit",
      "3",
    ]);

    assert.equal(memory.ok, true);
    assert.equal(memory.command, "memory init");
    assert.equal(memory.data?.status, "ok");
    assert.equal(decisions.ok, true);
    assert.equal(decisions.command, "decisions list");
    assert.equal((decisions.data?.count as number), 1);
    assert.equal(monitor.ok, true);
    assert.equal(monitor.command, "market-monitor run");
    assert.equal(marketDataFetch.ok, true);
    assert.equal(marketDataFetch.command, "market-data fetch");
    assert.equal(marketDataHealth.ok, true);
    assert.equal(marketDataHealth.command, "market-data health");
    assert.equal(marketDataQuality.ok, true);
    assert.equal(marketDataQuality.command, "market-data quality");

    assert.equal(
      calls.find(
        (call) => call.url === "http://127.0.0.1:8000/api/intel/market-agent/market-monitor/run",
      )?.method,
      "POST",
    );
    assert.equal(
      calls.find(
        (call) =>
          call.url ===
          "http://127.0.0.1:8000/api/intel/market-agent/market-monitor/run",
      )?.body,
      '{"symbols":["TSLA"],"timeframes":["1d"],"limit":7,"allow_live_fallback":true}',
    );
    assert.equal(
      calls.find(
        (call) =>
          call.url ===
          "http://127.0.0.1:8000/api/intel/market-agent/market-data/fetch?symbol=TSLA&timeframe=1d&limit=9&allow_live_fallback=true",
      )?.method,
      "GET",
    );
    assert.equal(
      calls.find(
        (call) =>
          call.url ===
          "http://127.0.0.1:8000/api/intel/market-agent/market-data/quality?symbol=TSLA&timeframe=1d&limit=3",
      )?.method,
      "GET",
    );
    assert.deepEqual(calls.map((call) => call.url).sort(), [
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/fetch?symbol=TSLA&timeframe=1d&limit=9&allow_live_fallback=true",
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/health?symbol=TSLA",
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/quality?symbol=TSLA&timeframe=1d&limit=3",
      "http://127.0.0.1:8000/api/intel/market-agent/market-monitor/run",
      "http://127.0.0.1:8000/api/intel/market-agent/memory/init",
      "http://127.0.0.1:8000/api/intel/stage1/model-decisions?symbol=TSLA&model_version=stage1-v0&limit=5",
    ].sort());
  } finally {
    globalThis.fetch = originalFetch;
  }
});
