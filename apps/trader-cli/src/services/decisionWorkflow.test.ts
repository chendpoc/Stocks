import assert from "node:assert/strict";
import test from "node:test";

import { buildGateDecision } from "../daemon/agentFactory.js";

test("buildGateDecision returns null without symbols", () => {
  assert.equal(buildGateDecision({ complexityScore: 0.5 }), null);
});

test("buildGateDecision defaults complexity when missing", () => {
  const gate = buildGateDecision({ symbols: ["COIN"] });
  assert.equal(gate?.complexity_score, 0.1);
  assert.deepEqual(gate?.symbols, ["COIN"]);
});
