import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLongbridgeAgent } from "./longbridgeAgent.js";

test("normalizeLongbridgeAgent defaults to on", () => {
  assert.equal(normalizeLongbridgeAgent(undefined), "on");
  assert.equal(normalizeLongbridgeAgent(""), "on");
});

test("normalizeLongbridgeAgent accepts off variants", () => {
  assert.equal(normalizeLongbridgeAgent("off"), "off");
  assert.equal(normalizeLongbridgeAgent("false"), "off");
  assert.equal(normalizeLongbridgeAgent("0"), "off");
});
