import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretLongbridgeCheck,
  toLongbridgeSymbol,
} from "./longbridge.js";

test("toLongbridgeSymbol maps US tickers", () => {
  assert.equal(toLongbridgeSymbol("tsla"), "TSLA.US");
  assert.equal(toLongbridgeSymbol("QQQ"), "QQQ.US");
  assert.equal(toLongbridgeSymbol("700.HK"), "700.HK");
});

test("interpretLongbridgeCheck detects auth failure", () => {
  const r = interpretLongbridgeCheck(
    1,
    "",
    "Authentication failed: oauth error: failed to refresh token",
  );
  assert.equal(r.authOk, false);
  assert.match(r.message, /auth login/i);
});

test("interpretLongbridgeCheck accepts success output", () => {
  const r = interpretLongbridgeCheck(0, "Region: US · API: ok", "");
  assert.equal(r.authOk, true);
  assert.match(r.message, /Region/i);
});
