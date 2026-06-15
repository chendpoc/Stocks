import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchWatchlistQuoteKey } from "./watchlist.js";

describe("matchWatchlistQuoteKey", () => {
  test("matches bare ticker to longbridge symbol", () => {
    assert.equal(matchWatchlistQuoteKey(["AAPL.US"], "AAPL"), "AAPL.US");
  });

  test("keeps exact symbol match", () => {
    assert.equal(matchWatchlistQuoteKey(["700.HK"], "700.HK"), "700.HK");
  });

  test("falls back to response symbol when batch has no match", () => {
    assert.equal(matchWatchlistQuoteKey(["NVDA.US"], "TSLA"), "TSLA");
  });
});
