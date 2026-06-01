import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ALLOWED_FIRST_ARGS,
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

test("BLOCKED_TOP_LEVEL does not contain check (D312)", () => {
  const r = validateLongbridgeInvoke("check", []);
  assert.ok(r && !r.ok);
  assert.equal(r && !r.ok && r.code, "NOT_WHITELISTED");
});

test("Invoke with non-allowed first arg returns FORBIDDEN_SUBCOMMAND", () => {
  const r = validateLongbridgeInvoke("option", ["deploy"]);
  assert.ok(r && !r.ok);
  assert.equal(r && !r.ok && r.code, "FORBIDDEN_SUBCOMMAND");
});

test("Invoke with allowed first arg passes validation", () => {
  assert.equal(validateLongbridgeInvoke("option", ["list"]), null);
  assert.equal(validateLongbridgeInvoke("filing", ["detail", "--symbol", "TSLA.US"]), null);
  assert.equal(validateLongbridgeInvoke("brokers", []), null);
  assert.equal(validateLongbridgeInvoke("rank", ["--symbol", "TSLA.US"]), null);
});
