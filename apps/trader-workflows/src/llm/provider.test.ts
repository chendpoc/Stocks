import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionPrompt,
  DECISION_THESIS_PROMPT_GUIDE_PARAGRAPH,
  DECISION_THESIS_PROMPT_STYLE_ACTIVE,
  DECISION_THESIS_SYSTEM_MESSAGE_PARAGRAPH,
  DECISION_THESIS_SYSTEM_MESSAGE_STRUCTURED,
  extractChatCompletionMessageText,
  formatDecisionAsOfForPrompt,
} from "./provider.js";
import type { WeightedContextItem } from "../types/context.js";

const SAMPLE_ITEM: WeightedContextItem = {
  item_id: "market_bar:AAPL:daily:latest",
  source_type: "market_bar",
  evidence_ref: {
    ref_type: "intel_market_bar",
    ref_id: "AAPL:1d:latest",
    symbol: "AAPL",
  },
  summary: "Latest daily close 312.06 (-0.14% vs prior)",
  confidence: 0.9,
  relevance_weight: 1,
  freshness_weight: 1,
  source_quality_weight: 0.9,
  verification_status: "verified",
  composite_weight: 0.8,
};

test("extractChatCompletionMessageText falls back to reasoning_content", () => {
  const text = extractChatCompletionMessageText({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: "",
          reasoning_content: '{"symbol":"AAPL","action":"NO_TRADE","thesis":"x","confidence":0.5}',
        },
      },
    ],
  });
  assert.match(text, /"action":"NO_TRADE"/);
});

test("formatDecisionAsOfForPrompt uses Asia/Shanghai by default", () => {
  const prevTz = process.env.DECISION_PROMPT_TZ;
  const prevSystemTz = process.env.TZ;
  delete process.env.DECISION_PROMPT_TZ;
  delete process.env.TZ;

  try {
    const formatted = formatDecisionAsOfForPrompt("2026-06-03T17:04:48.519Z");
    assert.match(formatted, /Asia\/Shanghai/);
    assert.doesNotMatch(formatted, /\| UTC /);
    assert.match(formatted, /2026/);
    assert.match(formatted, /01:04/);
  } finally {
    if (prevTz === undefined) {
      delete process.env.DECISION_PROMPT_TZ;
    } else {
      process.env.DECISION_PROMPT_TZ = prevTz;
    }
    if (prevSystemTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = prevSystemTz;
    }
  }
});

test("buildDecisionPrompt includes LLM evidence analysis when provided", () => {
  const prompt = buildDecisionPrompt({
    symbol: "TSLA",
    asof_ts: "2026-06-03T17:04:48.519Z",
    contextItems: [SAMPLE_ITEM],
    llmAnalysis: {
      evidence_text: "VWAP reclaim confirmed",
      contra_text: "Volume risk remains",
      confidence_contribution: 0.55,
      risk_flags: ["low_volume_risk"],
    },
  });

  assert.match(prompt, /LLM evidence \/ contra analysis/);
  assert.match(prompt, /confidence_contribution=0.55/);
  assert.match(prompt, /low_volume_risk/);
});

test("buildDecisionPrompt includes timeframe guide and structured thesis labels", () => {
  const prompt = buildDecisionPrompt({
    symbol: "AAPL",
    asof_ts: "2026-06-03T17:04:48.519Z",
    contextItems: [SAMPLE_ITEM],
  });

  assert.match(prompt, /决策时点/);
  assert.match(prompt, /时点：/);
  assert.match(prompt, /4-5行/);
  assert.doesNotMatch(prompt, /3-4行/);
  assert.match(prompt, /周期：daily\|multi-day\|mixed/);
  assert.match(prompt, /日K/);
  assert.match(prompt, /禁止缩量/);
  assert.match(prompt, /Symbol: AAPL/);
  assert.match(prompt, /"source_type":"market_bar"/);
});

test("legacy paragraph thesis prompts are retained but not active by default", () => {
  assert.equal(DECISION_THESIS_PROMPT_STYLE_ACTIVE, "structured");
  assert.match(DECISION_THESIS_PROMPT_GUIDE_PARAGRAPH, /一段中文结论/);
  assert.match(DECISION_THESIS_SYSTEM_MESSAGE_PARAGRAPH, /one short Chinese paragraph/);
  assert.match(DECISION_THESIS_SYSTEM_MESSAGE_STRUCTURED, /时点\/周期/);

  const prev = process.env.DECISION_THESIS_PROMPT;
  delete process.env.DECISION_THESIS_PROMPT;
  try {
    const prompt = buildDecisionPrompt({
      symbol: "AAPL",
      asof_ts: "2026-06-03T17:04:48.519Z",
      contextItems: [SAMPLE_ITEM],
    });
    assert.doesNotMatch(prompt, /一段中文结论/);
  } finally {
    if (prev === undefined) {
      delete process.env.DECISION_THESIS_PROMPT;
    } else {
      process.env.DECISION_THESIS_PROMPT = prev;
    }
  }
});

test("DECISION_THESIS_PROMPT=v0_paragraph selects legacy guide only when set", () => {
  const prev = process.env.DECISION_THESIS_PROMPT;
  process.env.DECISION_THESIS_PROMPT = "v0_paragraph";
  try {
    const prompt = buildDecisionPrompt({
      symbol: "TSLL",
      asof_ts: "2026-06-03T17:04:48.519Z",
      contextItems: [SAMPLE_ITEM],
    });
    assert.match(prompt, /一段中文结论/);
    assert.doesNotMatch(prompt, /决策时点/);
    assert.doesNotMatch(prompt, /周期：daily\|multi-day\|mixed/);
  } finally {
    if (prev === undefined) {
      delete process.env.DECISION_THESIS_PROMPT;
    } else {
      process.env.DECISION_THESIS_PROMPT = prev;
    }
  }
});
