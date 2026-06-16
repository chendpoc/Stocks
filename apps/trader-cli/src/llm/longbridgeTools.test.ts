import assert from "node:assert/strict";
import test from "node:test";
import { LONGBRIDGE_TOOLS } from "./longbridge/index.js";

const EXPECTED_ORDER = [
  "getLongbridgeQuote",
  "getLongbridgeKline",
  "getLongbridgeIntraday",
  "getLongbridgeDepth",
  "getLongbridgeTrades",
  "getLongbridgeCapital",
  "getLongbridgeStatic",
  "getLongbridgeCalcIndex",
  "getLongbridgeNews",
  "getLongbridgeFinancialReport",
  "getLongbridgeValuation",
  "getLongbridgeConsensus",
  "getLongbridgeForecastEps",
  "getLongbridgeDividend",
  "getLongbridgeScreener",
  "getLongbridgeCompare",
  "getLongbridgeMarketTemp",
  "getLongbridgeMarketStatus",
  "getLongbridgePositions",
  "getLongbridgePortfolio",
  "getLongbridgeAssets",
  "listLongbridgeWatchlist",
  "longbridgeInvoke",
];

test("LONGBRIDGE_TOOLS preserves tool names and registration order", () => {
  assert.equal(LONGBRIDGE_TOOLS.length, 23);
  assert.deepEqual(LONGBRIDGE_TOOLS.map((t) => t.name), EXPECTED_ORDER);
  for (const tool of LONGBRIDGE_TOOLS) {
    assert.equal(tool.group, "longbridge");
  }
});
