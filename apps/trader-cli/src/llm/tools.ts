import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../api/client";
import { auditHypothesis } from "./auditor";

export const SYSTEM_PROMPT = `你是 Forward Market Intelligence Agent，面向交易研究的市场情报助手。

工作流程：
- 行情 ingest → 特征扫描 → 信号 → LLM 假设 → 复盘 → Lesson → 反哺上下文
- MVP universe 为 8 个标的（TSLA、TSLL、QQQ、SPY、ARKK、NVDA、COIN、BMNR），共 11 个工具
- 所有数据必须通过 tool 拉取，禁止凭记忆或臆测
- 推理必须可审计：claim、正反证据、失效条件、可验证预测必须齐全

工作原则：
- 区分专业解释（professional_explanation）与白话解释（plain_language_explanation）
- 不使用「必涨／必跌／绝对／100%／保证」等绝对化语言
- 相对强弱（跑赢／跑输）必须对比基准（QQQ / SPY / 大盘）
- 含 13F／ARK 等 smart money 数据时必须标注季度延迟与价格确认

当用户要求"分析某标的"或"复盘"时，调用 saveHypothesis 工具保存结论；
saveHypothesis 的字段（claim、evidence_for 等）即 hypotheses 表的必填 JSON 字段。`;

export const INTEL_TOOLS = {
  ingestMarketData: tool({
    description: "触发后端拉取 universe 的行情数据（日线 + 5m），写入 market_intel.db",
    parameters: z.object({}),
    execute: async () => fetchIntel("/market/ingest", { method: "POST" }),
  }),

  getMarketBars: tool({
    description: "查询某标的的历史 K 线",
    parameters: z.object({
      symbol: z.string().describe("标的代码，如 TSLA"),
      timeframe: z.enum(["1d", "5m"]).default("1d"),
      limit: z.number().default(20),
    }),
    execute: async ({ symbol, timeframe, limit }) =>
      fetchIntel(
        `/market/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
      ),
  }),

  getSignals: tool({
    description: "查询已生成的信号列表，可按标的与状态过滤",
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
    description: "对全 universe（8 个标的）跑一次特征扫描，生成最新候选信号",
    parameters: z.object({}),
    execute: async () => fetchIntel("/signals/scan", { method: "POST" }),
  }),

  buildContext: tool({
    description:
      "为 LLM 组装结构化上下文包，包含行情、信号、复盘 lesson、事件、语料检索结果的统一 JSON 视图",
    parameters: z.object({
      symbols: z.array(z.string()).describe("标的列表，如 ['TSLA','TSLL']"),
      taskType: z
        .enum([
          "signal_explanation",
          "market_intent_explanation",
          "agent_conversation",
          "learning_review",
        ])
        .describe("任务类型，决定上下文组装策略"),
      query: z.string().optional().describe("可选自然语言查询，用于语料检索"),
      signalId: z.string().optional().describe("关联的信号 ID"),
    }),
    execute: async (params) =>
      fetchIntel("/context/build", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  }),

  searchCorpus: tool({
    description: "在 Whop 群聊与文档语料中做全文检索",
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
    description: "查询某标的近期的新闻、宏观与社群事件",
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
    description: "查询历史复盘 lesson",
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
      "审计通过后写入交易假设（同时生成 predictions），signalId 来自 getSignals/scanSignals",
    parameters: z.object({
      signalId: z.string().describe("信号 ID，如 TSLA_2026_05_31_08_higher_low_candidate"),
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
