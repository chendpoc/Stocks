import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../api/client";
import { auditHypothesis } from "./auditor";

export const SYSTEM_PROMPT = `?? Forward Market Intelligence Agent????????????

?????
- ???????????????????????????
- ??????????????11 ???
- ???????????
- ???????????????????????????????

?????
- ????????????????
- ???????????????
- ???????????
- ?? 13F ???????????

????"????"?"??"??? saveHypothesis ??????
saveHypothesis ???????claim?evidence_for ??????? hypothesis ?????? JSON ????`;

export const INTEL_TOOLS = {
  ingestMarketData: tool({
    description: "???????????+5m????????",
    parameters: z.object({}),
    execute: async () => fetchIntel("/market/ingest", { method: "POST" }),
  }),

  getMarketBars: tool({
    description: "?????????K?",
    parameters: z.object({
      symbol: z.string().describe("?????? TSLA"),
      timeframe: z.enum(["1d", "5m"]).default("1d"),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, timeframe, limit }) =>
      fetchIntel(
        `/market/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
      ),
  }),

  getSignals: tool({
    description: "???????????",
    parameters: z.object({
      symbol: z.string().optional(),
      status: z.enum(["new", "explained", "verified", "invalidated"]).optional(),
      limit: z.number().default(50),
    }),
    execute: async ({ symbol, status, limit }) => {
      const params = new URLSearchParams();
      if (symbol) params.set("symbol", symbol);
      if (status) params.set("status", status);
      params.set("limit", String(limit));
      return fetchIntel(`/signals?${params.toString()}`);
    },
  }),

  scanSignals: tool({
    description: "?????????8?????????????????????",
    parameters: z.object({}),
    execute: async () => fetchIntel("/signals/scan", { method: "POST" }),
  }),

  buildContext: tool({
    description:
      "??LLM??????????????????????????????????????????????JSON??",
    parameters: z.object({
      symbols: z.array(z.string()).describe("??????? ['TSLA','TSLL']"),
      taskType: z
        .enum([
          "signal_explanation",
          "market_intent_explanation",
          "agent_conversation",
          "learning_review",
        ])
        .describe("?????????????"),
      query: z.string().optional().describe("????????????"),
      signalId: z.string().optional().describe("????ID"),
    }),
    execute: async (params) =>
      fetchIntel("/context/build", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  }),

  searchCorpus: tool({
    description: "??????????????????",
    parameters: z.object({
      query: z.string(),
      symbol: z.string().optional(),
      limit: z.number().default(5),
    }),
    execute: async ({ query, symbol, limit }) => {
      const params = new URLSearchParams({ query, limit: String(limit) });
      if (symbol) params.set("symbol", symbol);
      return fetchIntel(`/corpus/search?${params.toString()}`);
    },
  }),

  getEvents: tool({
    description: "????????????????",
    parameters: z.object({
      symbol: z.string().optional(),
      days: z.number().default(7),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, days, limit }) => {
      const params = new URLSearchParams({ days: String(days), limit: String(limit) });
      if (symbol) params.set("symbol", symbol);
      return fetchIntel(`/events?${params.toString()}`);
    },
  }),

  getLessons: tool({
    description: "????????",
    parameters: z.object({
      symbol: z.string().optional(),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, limit }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (symbol) params.set("symbol", symbol);
      return fetchIntel(`/lessons?${params.toString()}`);
    },
  }),

  saveHypothesis: tool({
    description:
      "???????????????????????signalId ?? getSignals/scanSignals",
    parameters: z.object({
      signalId: z.string().describe("?? ID?? TSLA_2026_05_31_08_higher_low_candidate"),
      claim: z.string(),
      professional_explanation: z.string(),
      plain_language_explanation: z.string(),
      candidate_explanations: z.array(z.string()),
      evidence_for: z.array(z.string()),
      evidence_against: z.array(z.string()),
      reasoning_gap: z.string().optional(),
      missing_evidence: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      tradability: z.enum(["no_trade", "watchlist", "setup_forming", "trade_candidate"]),
      invalidation_condition: z.string(),
      predictions: z.array(
        z.object({
          window: z.string(),
          expected_outcome: z.string(),
          invalid_if: z.string(),
        }),
      ),
    }),
    execute: async ({
      signalId,
      claim,
      professional_explanation,
      plain_language_explanation,
      candidate_explanations,
      evidence_for,
      evidence_against,
      reasoning_gap,
      missing_evidence,
      confidence,
      tradability,
      invalidation_condition,
      predictions,
    }) => {
      const hypothesis = {
        claim,
        professional_explanation,
        plain_language_explanation,
        candidate_explanations,
        evidence_for,
        evidence_against,
        reasoning_gap,
        missing_evidence,
        confidence,
        tradability,
        invalidation_condition,
        predictions,
      };
      const issues = auditHypothesis(hypothesis);
      if (issues.blockers.length > 0) {
        return { error: "audit_blocked", blockers: issues.blockers };
      }
      return fetchIntel("/hypotheses", {
        method: "POST",
        body: JSON.stringify({
          signal_id: signalId,
          ...hypothesis,
          audit_warnings: issues.warnings,
        }),
      });
    },
  }),
};
