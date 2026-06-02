import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProbability,
  parseDecisionEnvelope,
} from "./decisionEnvelope.js";

test("normalizeProbability accepts percentages and clamps overflow", () => {
  assert.equal(normalizeProbability(75, { field: "confidence" }), 0.75);
  assert.equal(normalizeProbability(1.2, { field: "uncertainty", optional: true }), 1);
  assert.equal(
    normalizeProbability("high", { field: "uncertainty", optional: true }),
    0.75,
  );
});

test("parseDecisionEnvelope normalizes lowercase action and percentage uncertainty", () => {
  const envelope = parseDecisionEnvelope({
    symbol: "tsla",
    action: "watch",
    thesis: "Wait for confirmation",
    confidence: 0.62,
    uncertainty: 35,
    watch_condition: "break above 20dma",
  });

  assert.equal(envelope.symbol, "TSLA");
  assert.equal(envelope.action, "WATCH");
  assert.equal(envelope.uncertainty, 0.35);
});

test("parseDecisionEnvelope coalesces camelCase plan field aliases", () => {
  const envelope = parseDecisionEnvelope({
    symbol: "TSLA",
    action: "WATCH",
    thesis: "Momentum unclear",
    confidence: 0.55,
    watchCondition: "Close above 200 DMA with volume",
  });

  assert.equal(envelope.watch_condition, "Close above 200 DMA with volume");
});

test("parseDecisionEnvelope drops unparseable optional uncertainty", () => {
  const envelope = parseDecisionEnvelope({
    symbol: "TSLA",
    action: "NO_TRADE",
    thesis: "No edge",
    confidence: 0.4,
    uncertainty: "unknown",
  });

  assert.equal(envelope.uncertainty, undefined);
});
