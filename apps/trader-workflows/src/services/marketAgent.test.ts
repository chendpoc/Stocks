import assert from "node:assert/strict";
import test from "node:test";

import { captureFetchCall, resolveFetchUrl } from "../test/fetchTestUtils.js";
import {
  listDecisionOutcomes,
  listInsightCandidates,
  bootstrapContext,
  getLatestContext,
  listPatternMemories,
  listFailureMemories,
  promotePatternMemory,
  degradePatternMemory,
  initMarketAgentMemory,
  listModelDecisions,
  runMarketMonitor,
  fetchMarketData,
  getMarketDataHealth,
  getMarketDataQuality,
} from "./marketAgent.js";

interface FetchCall {
  url: string;
  method: string;
  body?: string;
}

test("listDecisionOutcomes builds expected Stage1 request", async () => {
  const calls: string[] = [];
  const responseBody = {
    items: [
      {
        outcome_id: "out-1",
        decision_id: "dec-1",
        symbol: "TSLA",
        horizon: "2h",
        path: "path-a",
        status: "pending",
        due_at: null,
        scheduled_at: null,
        label: "hit",
        created_at: "2026-06-01T10:00:00Z",
      },
    ],
    count: 1,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(resolveFetchUrl(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await listDecisionOutcomes({
      symbol: "tsla",
      status: "pending",
      limit: 12,
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      "http://127.0.0.1:8000/api/intel/stage1/decision-outcomes?symbol=TSLA&status=pending&limit=12",
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bootstrapContext posts expected market-agent payload", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    session_context_pack_id: "pack-bootstrap-1",
    session_id: "sess-1",
    symbol: "TSLA",
    markdown: "summary",
    max_chars: 200,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    calls.push(await captureFetchCall(input, options));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await bootstrapContext({
      session_id: "sess-1",
      profile: "main",
      symbol: "tsla",
      max_chars: 200,
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/context/bootstrap",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(
      calls[0].body,
      '{"session_id":"sess-1","profile":"main","symbol":"TSLA","max_chars":200}',
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("initMarketAgentMemory posts expected market-agent payload", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    status: "ok",
    table_names: ["feature_snapshots", "setup_events"],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    calls.push(await captureFetchCall(input, options));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await initMarketAgentMemory();
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/memory/init",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body, undefined);
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listModelDecisions maps stage1 model-decisions query contract", async () => {
  const calls: string[] = [];
  const responseBody = {
    items: [
      {
        decision_id: "dec-1",
        model_version: "stage1-v0",
        symbol: "TSLA",
        status: "active",
      },
    ],
    count: 1,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(resolveFetchUrl(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await listModelDecisions({
      symbol: "tsla",
      model_version: "stage1-v0",
      limit: 12,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      "http://127.0.0.1:8000/api/intel/stage1/model-decisions?symbol=TSLA&model_version=stage1-v0&limit=12",
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runMarketMonitor posts expected market-agent payload", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    results: [{ symbol: "TSLA" }, { symbol: "AAPL" }],
    count: 2,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    calls.push(await captureFetchCall(input, options));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await runMarketMonitor({
      symbols: ["TSLA", "AAPL"],
      timeframes: ["1d", "5m"],
      limit: 13,
      min_required: 4,
      allow_live_fallback: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/market-monitor/run",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(
      calls[0].body,
      '{"symbols":["TSLA","AAPL"],"timeframes":["1d","5m"],"limit":13,"min_required":4,"allow_live_fallback":true}',
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMarketData maps GET query contract and defaults timeframe", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    symbol: "TSLA",
    timeframe: "1d",
    bars: [],
    quality_status: "pass",
    quality_reason: "ok",
    bar_count: 0,
    source: "db",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await fetchMarketData({
      symbol: "tsla",
      limit: 11,
      min_required: 3,
      allow_live_fallback: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/fetch?symbol=TSLA&timeframe=1d&limit=11&min_required=3&allow_live_fallback=true",
    );
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getMarketDataHealth maps optional symbol query contract", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    status: "healthy",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const resultNoSymbol = await getMarketDataHealth();
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/health",
    );

    const resultWithSymbol = await getMarketDataHealth({ symbol: "nvda" });
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/health?symbol=NVDA",
    );
    assert.equal(resultNoSymbol.status, "healthy");
    assert.deepEqual(resultWithSymbol, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getMarketDataQuality maps quality GET contract", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    status: "pass",
    reason: "ok",
    bar_count: 20,
    min_required: 12,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await getMarketDataQuality({
      symbol: "amd",
      limit: 12,
      min_required: 12,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/market-data/quality?symbol=AMD&timeframe=1d&limit=12&min_required=12",
    );
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getLatestContext builds expected market-agent request", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    session_context_pack_id: "pack-latest-1",
    session_id: "sess-2",
    symbol: "AAPL",
    markdown: "latest",
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await getLatestContext({
      session_id: "sess-2",
      symbol: "aapl",
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/context/latest?session_id=sess-2&symbol=AAPL",
    );
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listPatternMemories builds expected request", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    items: [
      {
        pattern_memory_id: "pm-1",
        symbol: "TSLA",
        pattern_id: "p-accumulate",
        status: "promoted",
      },
    ],
    count: 1,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await listPatternMemories({
      symbol: "tsla",
      pattern_id: "p-accumulate",
      status: "promoted",
      limit: 12,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory?symbol=TSLA&pattern_id=p-accumulate&status=promoted&limit=12",
    );
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("promotePatternMemory posts expected market-agent payload", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    item: {
      pattern_memory_id: "pm-2",
      symbol: "TSLA",
      pattern_id: "p-accumulate",
      status: "promoted",
      memory_json: { status: "promoted" },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    calls.push(await captureFetchCall(input, options));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await promotePatternMemory({
      pattern_memory_id: "pm-1",
      confirm: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/promote",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(
      calls[0].body,
      '{"pattern_memory_id":"pm-1","confirm":true}',
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("degradePatternMemory posts expected market-agent payload", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    item: {
      pattern_memory_id: "pm-3",
      symbol: "TSLA",
      pattern_id: "p-accumulate",
      status: "degrading",
      memory_json: { status: "degrading" },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, options = {}) => {
    calls.push(await captureFetchCall(input, options));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await degradePatternMemory({
      pattern_id: "p-accumulate",
      reason: "too many false positives",
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/pattern-memory/degrade",
    );
    assert.equal(calls[0].method, "POST");
    assert.equal(
      calls[0].body,
      '{"pattern_id":"p-accumulate","reason":"too many false positives"}',
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listFailureMemories builds expected request with --failure-type", async () => {
  const calls: FetchCall[] = [];
  const responseBody = {
    items: [
      {
        failure_memory_id: "fm-1",
        symbol: "TSLA",
        failure_type: "timeout",
      },
    ],
    count: 1,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(await captureFetchCall(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await listFailureMemories({
      symbol: "tsla",
      failure_type: "timeout",
      setup: "setup-a",
      status: "active",
      limit: 7,
    });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "http://127.0.0.1:8000/api/intel/market-agent/failure-memory?symbol=TSLA&failure_type=timeout&setup=setup-a&status=active&limit=7",
    );
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listInsightCandidates builds expected Stage1 request", async () => {
  const calls: string[] = [];
  const responseBody = {
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
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    calls.push(resolveFetchUrl(input));
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as Response;
  }) as typeof fetch;

  try {
    const result = await listInsightCandidates({
      symbol: "tsla",
      verification_status: "pending",
      limit: 7,
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      "http://127.0.0.1:8000/api/intel/stage1/insight-candidates?symbol=TSLA&verification_status=pending&limit=7",
    );
    assert.deepEqual(result, responseBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
