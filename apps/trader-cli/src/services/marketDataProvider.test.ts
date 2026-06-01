import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMarketDataProvider } from "./marketDataProvider.js";

test("normalizeMarketDataProvider accepts aliases", () => {
  assert.equal(normalizeMarketDataProvider("auto"), "auto");
  assert.equal(normalizeMarketDataProvider("yfinance"), "yfinance");
  assert.equal(normalizeMarketDataProvider("alpha_vantage"), "alpha_vantage");
  assert.equal(normalizeMarketDataProvider("alphavantage"), "alpha_vantage");
  assert.equal(normalizeMarketDataProvider("mixed"), "auto");
  assert.equal(normalizeMarketDataProvider("bogus"), "auto");
});
