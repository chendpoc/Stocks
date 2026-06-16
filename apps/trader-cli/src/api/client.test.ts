import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

describe("safeFetchIntel", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.TRADER_API_BASE = "http://127.0.0.1:8000/api/intel";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns structured error when intel API responds with failure", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response("unavailable", { status: 503, statusText: "Service Unavailable" }),
    ) as typeof fetch;

    const { safeFetchIntel } = await import(`./client.js?test=${Date.now()}`);
    const result = await safeFetchIntel("/market/bars", {
      searchParams: { symbol: "AAPL" },
    });

    assert.equal((result as { ok: boolean }).ok, false);
    assert.equal((result as { code: string }).code, "INTEL_ERROR");
    assert.match((result as { message: string }).message, /503/);
  });

  test("returns structured error when fetch throws", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const { safeFetchIntel } = await import(`./client.js?test=${Date.now()}`);
    const result = await safeFetchIntel("/signals");

    assert.deepEqual(result, {
      ok: false,
      code: "INTEL_ERROR",
      message: "network down",
    });
  });

  test("fetchIntel POST completes via ky", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as typeof fetch;

    const { fetchIntel } = await import(`./client.js?post=${Date.now()}`);
    const result = await fetchIntel<{ ok: boolean }>("/context/build", {
      method: "POST",
      json: { symbols: ["TSLA"], taskType: "signal_explanation" },
    });

    assert.equal(result.ok, true);
  });
});
