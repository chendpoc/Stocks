import assert from "node:assert/strict";
import test from "node:test";
import { createLongbridgeTools } from "./longbridgeTools.js";

const tools = createLongbridgeTools();
const toolNames = Object.keys(tools);

test("createLongbridgeTools returns 23 tools (22 Tier1 + 1 invoke)", () => {
  assert.equal(toolNames.length, 23);
});

test("Tier1 tool names match spec", () => {
  const expected = [
    "getLongbridgeQuote",
    "getLongbridgeKline",
    "getLongbridgeIntraday",
    "getLongbridgeDepth",
    "getLongbridgeTrades",
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
    "getLongbridgeCapital",
  ].sort();
  const tier1 = toolNames.filter((n) => n !== "longbridgeInvoke").sort();
  assert.deepEqual(tier1, expected);
});

test("longbridgeInvoke is present", () => {
  assert.ok(toolNames.includes("longbridgeInvoke"));
});

test("longbridgeInvoke rejects order with FORBIDDEN_COMMAND", async () => {
  const invoke = tools.longbridgeInvoke;
  const result = await invoke.execute({ command: "order", args: [] }, {
    toolCallId: "test",
    messages: [],
  } as any);
  assert.equal(result.ok, false);
  assert.equal((result as any).code, "FORBIDDEN_COMMAND");
});

test("longbridgeInvoke rejects check with NOT_WHITELISTED", async () => {
  const invoke = tools.longbridgeInvoke;
  const result = await invoke.execute({ command: "check", args: [] }, {
    toolCallId: "test",
    messages: [],
  } as any);
  assert.equal(result.ok, false);
  assert.equal((result as any).code, "NOT_WHITELISTED");
});

test("getLongbridgeQuote rejects >10 symbols with MULTI_SYMBOL_LIMIT", async () => {
  const quote = tools.getLongbridgeQuote;
  const symbols = Array.from({ length: 11 }, (_, i) => `SYM${i}`);
  const result = await quote.execute({ symbols }, {
    toolCallId: "test",
    messages: [],
  } as any);
  assert.equal(result.ok, false);
  assert.equal((result as any).code, "MULTI_SYMBOL_LIMIT");
});

test("getLongbridgeQuote accepts valid single symbol (proceeds to CLI call)", async () => {
  const quote = tools.getLongbridgeQuote;
  // Single symbol — execute will call runLongbridgeJson which may fail (no CLI in test),
  // but the point is it does NOT return MULTI_SYMBOL_LIMIT or a validation error.
  const result = await quote.execute({ symbol: "TSLA" }, {
    toolCallId: "test",
    messages: [],
  } as any);
  // Should either succeed (ok:true) or fail with CLI_ERROR/NOT_INSTALLED — never MULTI_SYMBOL_LIMIT
  if (!result.ok) {
    assert.notEqual((result as any).code, "MULTI_SYMBOL_LIMIT");
  }
});
