import assert from "node:assert/strict";
import test from "node:test";
import {
  GATEWAY_WHITELIST,
  sanitizeLongbridgeArgs,
  validateLongbridgeInvoke,
} from "./longbridgeCli.js";

test("sanitizeLongbridgeArgs rejects forbidden tokens", () => {
  const r = sanitizeLongbridgeArgs(["buy", "TSLA.US"]);
  assert.equal("ok" in r && r.ok, false);
});

test("validateLongbridgeInvoke blocks order and tier1 quote", () => {
  const order = validateLongbridgeInvoke("order", ["list"]);
  assert.ok(order && !order.ok);
  const quote = validateLongbridgeInvoke("quote", []);
  assert.ok(quote && !quote.ok);
});

test("validateLongbridgeInvoke allows whitelisted option", () => {
  assert.equal(validateLongbridgeInvoke("option", ["chain", "TSLA.US"]), null);
});

test("gateway whitelist covers majority of read-only CLI families", () => {
  assert.ok(GATEWAY_WHITELIST.size >= 40);
});
