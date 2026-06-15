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
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "unavailable",
    })) as typeof fetch;

    const { safeFetchIntel } = await import("./client.js");
    const result = await safeFetchIntel("/market/bars?symbol=AAPL");

    assert.deepEqual(result, {
      ok: false,
      code: "INTEL_ERROR",
      message: "Intel API 503: unavailable",
    });
  });

  test("returns structured error when fetch throws", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const { safeFetchIntel } = await import("./client.js");
    const result = await safeFetchIntel("/signals");

    assert.deepEqual(result, {
      ok: false,
      code: "INTEL_ERROR",
      message: "network down",
    });
  });
});
