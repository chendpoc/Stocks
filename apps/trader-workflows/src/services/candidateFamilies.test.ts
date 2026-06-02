import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATE_FAMILIES,
  CANDIDATE_FAMILY_DEFINITIONS,
  isCandidateFamily,
} from "./candidateFamilies.js";

test("candidate family taxonomy stays finite and documented", () => {
  assert.deepEqual(CANDIDATE_FAMILIES, [
    "momentum_trend",
    "mean_reversion",
    "event_driven",
    "liquidity_flow_microstructure",
    "relative_value_lead_lag",
    "cross_sectional_filter",
  ]);

  for (const family of CANDIDATE_FAMILIES) {
    const definition = CANDIDATE_FAMILY_DEFINITIONS[family];
    assert.equal(definition.id, family);
    assert.ok(definition.label.length > 0);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.research_question.length > 0);
    assert.ok(definition.examples.length >= 3);
  }
});

test("candidate family type guard accepts only known family ids", () => {
  assert.equal(isCandidateFamily("event_driven"), true);
  assert.equal(isCandidateFamily("liquidity_flow_microstructure"), true);
  assert.equal(isCandidateFamily("technical_indicator_grab_bag"), false);
  assert.equal(isCandidateFamily(""), false);
});
