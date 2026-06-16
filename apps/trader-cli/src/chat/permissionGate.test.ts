import assert from "node:assert/strict";
import test from "node:test";
import { assertToolPermitted, evaluateToolPermission } from "./permissionGate.js";

test("read-only market tool is auto allowed", () => {
  const d = evaluateToolPermission("getMarketBars");
  assert.equal(d.policy, "auto");
  assert.equal(d.allowed, true);
});

test("memory write requires confirm and is not auto allowed", () => {
  const d = evaluateToolPermission("saveHypothesis");
  assert.equal(d.policy, "confirm");
  assert.equal(d.allowed, false);
});

test("trade-like tool is blocked", () => {
  const d = evaluateToolPermission("submitOrder");
  assert.equal(d.policy, "blocked");
  assert.throws(() => assertToolPermitted("submitOrder"));
});
