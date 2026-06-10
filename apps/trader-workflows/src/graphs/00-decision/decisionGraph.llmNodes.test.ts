import assert from "node:assert/strict";
import test from "node:test";

import {
  applyContraGuardrails,
  mergeConfidenceContribution,
} from "./contraResult.js";
import {
  applyEvidenceGuardrails,
  EvidenceResultSchema,
} from "./evidenceResult.js";
import {
  buildEvidence,
  generateContra,
  generateContraWithFallback,
  parseWorkerEvidence,
  runMidDayDeepAnalysis,
  runSwarmWorkers,
  shouldUseSwarm,
  type ChatReActFn,
} from "./decisionGraph.llmNodes.js";

const SAMPLE_EVIDENCE = {
  evidence_text: "TSLA VWAP reclaim with volume confirmation and positive news flow",
  confidence_contribution: 0.8,
  evidence_sources: ["fetchMarketBars", "webSearch", "queryPatternHistory"],
};

test("EvidenceResultSchema validates evidence_text and confidence bounds", () => {
  const parsed = EvidenceResultSchema.parse(SAMPLE_EVIDENCE);
  assert.ok(parsed.evidence_text.length > 0);
  assert.ok(parsed.confidence_contribution >= 0);
  assert.ok(parsed.confidence_contribution <= 1);
});

test("applyEvidenceGuardrails rule A zeroes confidence with no sources", () => {
  const out = applyEvidenceGuardrails(
    { ...SAMPLE_EVIDENCE, evidence_sources: [], confidence_contribution: 0.9 },
    { reactSteps: 3 },
  );
  assert.equal(out.confidence_contribution, 0);
});

test("applyEvidenceGuardrails rule D records missing dimensions", () => {
  const out = applyEvidenceGuardrails(
    {
      ...SAMPLE_EVIDENCE,
      evidence_sources: ["fetchMarketBars"],
      confidence_contribution: 0.6,
    },
    { reactSteps: 5, toolsUsed: ["fetchMarketBars"] },
  );
  assert.ok(out.needs_review);
  assert.ok(out.missing_evidence_dimensions?.includes("sentiment"));
  assert.ok(out.missing_evidence_dimensions?.includes("history"));
});

test("applyEvidenceGuardrails rule I flags unverified news", () => {
  const out = applyEvidenceGuardrails(SAMPLE_EVIDENCE, {
    reactSteps: 3,
    unverifiedNews: true,
  });
  assert.ok(out.risk_flags?.includes("unverified_news_source"));
});

test("parseWorkerEvidence extracts JSON block from worker text", () => {
  const parsed = parseWorkerEvidence(
    'done\n```json\n{"evidence_text":"TSLA ok","confidence_contribution":0.7,"evidence_sources":["fetchMarketBars"]}\n```',
  );
  assert.equal(parsed.confidence_contribution, 0.7);
  assert.equal(parsed.evidence_sources[0], "fetchMarketBars");
});

test("applyEvidenceGuardrails rule B caps single-source confidence", () => {
  const out = applyEvidenceGuardrails(
    {
      ...SAMPLE_EVIDENCE,
      evidence_sources: ["fetchMarketBars"],
      confidence_contribution: 0.9,
    },
    { reactSteps: 3 },
  );
  assert.equal(out.confidence_contribution, 0.5);
});

test("applyContraGuardrails rule E flags suspicious high score", () => {
  const out = applyContraGuardrails(
    {
      contra_text: "Looks fine",
      risk_flags: [],
      quality_score: 0.85,
      criteria_scores: {
        evidence_completeness: 0.5,
        setup_validation: 0.5,
        risk_identification: 0.5,
      },
    },
    { evidenceSourceCount: 3 },
  );
  assert.equal(out.quality_score, 0.6);
  assert.ok(out.risk_flags.includes("suspicious_high_score"));
});

test("mergeConfidenceContribution uses min of evidence and judge", () => {
  assert.equal(mergeConfidenceContribution(0.72, 0.55), 0.55);
});

test("shouldUseSwarm triggers at complexity >= 0.3", () => {
  assert.equal(shouldUseSwarm({ complexity_score: 0.29, symbols: ["TSLA"] }), false);
  assert.equal(
    shouldUseSwarm({ complexity_score: 0.3, symbols: ["TSLA", "NVDA"] }),
    true,
  );
});

test("buildEvidence uses generateText experimental_output and guardrails", async () => {
  const calls: unknown[] = [];
  const result = await buildEvidence(
    { symbol: "TSLA", setupName: "VWAP_Reclaim" },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      resolveTools: () => ({}),
      generateTextFn: async (opts) => {
        calls.push(opts);
        return {
          experimental_output: SAMPLE_EVIDENCE,
          steps: [{}, {}, {}],
        } as never;
      },
    },
  );

  assert.equal(calls.length, 1);
  const opts = calls[0] as { maxSteps: number; experimental_output?: unknown };
  assert.equal(opts.maxSteps, 5);
  assert.ok(opts.experimental_output);
  assert.equal(result.confidence_contribution, 0.3);
  assert.ok(result.evidence_text.length > 0);
});

test("generateContra runs proposer → opponent → judge with degradation", async () => {
  let callIndex = 0;
  const result = await generateContra(
    {
      evidenceText: SAMPLE_EVIDENCE.evidence_text,
      symbol: "TSLA",
      setupName: "VWAP_Reclaim",
      evidenceSourceCount: 3,
    },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      getProModel: () => ({ modelId: "pro" }) as never,
      getProThinkingModel: () => ({ modelId: "pro-thinking" }) as never,
      generateTextFn: async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return {
            experimental_output: { proposal: "Setup holds due to volume" },
          } as never;
        }
        if (callIndex === 2) {
          return {
            experimental_output: {
              paths: [
                {
                  path: "low volume fakeout",
                  score: 0.8,
                  detail: "Volume below average",
                  children: [{ path: "prior failures", score: 0.7, detail: "2/3 failed" }],
                },
              ],
            },
          } as never;
        }
        return {
          experimental_output: {
            contra_text: "Volume risk remains",
            risk_flags: ["low_volume_risk"],
            quality_score: 0.65,
            criteria_scores: {
              evidence_completeness: 0.7,
              setup_validation: 0.6,
              risk_identification: 0.8,
            },
          },
        } as never;
      },
    },
  );

  assert.ok(result);
  assert.equal(result?.risk_flags.includes("low_volume_risk"), true);
  assert.equal(callIndex, 3);
});

test("generateContra uses evidence support when proposer fails", async () => {
  const result = await generateContra(
    {
      evidenceText: "Volume confirms VWAP reclaim",
      symbol: "TSLA",
      setupName: "ORB",
      evidenceSourceCount: 2,
    },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      getProModel: () => ({ modelId: "pro" }) as never,
      getProThinkingModel: () => ({ modelId: "pro-thinking" }) as never,
      generateTextFn: async () => {
        throw new Error("proposer unavailable");
      },
    },
  );
  assert.ok(result);
  assert.ok(result!.contra_text.includes("Volume"));
  assert.ok(result!.quality_score > 0);
});

test("generateContraWithFallback returns unavailable when all roles fail", async () => {
  const result = await generateContraWithFallback(
    {
      evidenceText: "thin",
      symbol: "TSLA",
      setupName: "ORB",
      evidenceSourceCount: 0,
    },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      getProModel: () => ({ modelId: "pro" }) as never,
      getProThinkingModel: () => ({ modelId: "pro-thinking" }) as never,
      generateTextFn: async () => {
        throw new Error("unavailable");
      },
    },
  );
  assert.equal(result.quality_score, 0.45);
});

test("runSwarmWorkers parallelizes workers faster than serial", async () => {
  const symbols = ["TSLA", "NVDA", "COIN"];
  const delayMs = 40;
  let concurrent = 0;
  let maxConcurrent = 0;

  const chatReAct: ChatReActFn = async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, delayMs));
    concurrent -= 1;
    return { text: "evidence ok", wallClockMs: delayMs };
  };

  const start = Date.now();
  const workers = await runSwarmWorkers(
    {
      complexity_score: 0.5,
      symbols,
      setups: { TSLA: "A", NVDA: "B", COIN: "C" },
    },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      resolveTools: () => ({}),
      chatReAct,
    },
  );
  const elapsed = Date.now() - start;

  assert.equal(workers.length, 3);
  assert.ok(maxConcurrent >= 2, `expected parallel execution, maxConcurrent=${maxConcurrent}`);
  assert.ok(elapsed < delayMs * symbols.length * 1.5, `elapsed ${elapsed}ms too slow for parallel`);
});

test("runMidDayDeepAnalysis single path uses build_evidence + generate_contra", async () => {
  let callIndex = 0;
  const result = await runMidDayDeepAnalysis(
    { complexity_score: 0.1, symbols: ["TSLA"] },
    { symbol: "TSLA", setupName: "VWAP_Reclaim" },
    {
      getFlashModel: () => ({ modelId: "flash" }) as never,
      getProModel: () => ({ modelId: "pro" }) as never,
      getProThinkingModel: () => ({ modelId: "pro-thinking" }) as never,
      resolveTools: () => ({}),
      generateTextFn: async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { experimental_output: SAMPLE_EVIDENCE, steps: [{}] } as never;
        }
        if (callIndex === 2) {
          return { experimental_output: { proposal: "holds" } } as never;
        }
        if (callIndex === 3) {
          return {
            experimental_output: {
              paths: [{ path: "risk", score: 0.6, detail: "weak volume" }],
            },
          } as never;
        }
        return {
          experimental_output: {
            contra_text: "risk",
            risk_flags: ["low_volume_risk"],
            quality_score: 0.5,
            criteria_scores: {
              evidence_completeness: 0.5,
              setup_validation: 0.5,
              risk_identification: 0.5,
            },
          },
        } as never;
      },
    },
  );

  assert.equal(result.mode, "single");
  assert.ok(result.evidence);
  assert.ok(result.contra);
  assert.equal(callIndex, 4);
});
