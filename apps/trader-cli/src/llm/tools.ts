import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../api/client";
import { ingestSymbol } from "../services/market";
import { PREFERRED_SYMBOLS_LABEL } from "../symbols";
import { auditHypothesis } from "./auditor";

export const SYSTEM_PROMPT = `你是 Forward Market Intelligence Agent，面向交易研究的市场情报助手。

工作流程：
- 行情 ingest → 特征扫描 → 信号 → LLM 假设 → 复盘 → Lesson → 反哺上下文
- 系统支持任意合法 ticker（如 AAPL、MSFT、BTC 等），须通过 tool 拉取数据，禁止凭记忆或臆测
- 预设关注列表（用户偏好，非系统限制）：${PREFERRED_SYMBOLS_LABEL}。批量 scan/ingest 仅覆盖该列表；分析其他代码请用 ingestSymbolBars + getMarketBars + buildContext
- 推理必须可审计：claim、正反证据、失效条件、可验证预测必须齐全

工作原则：
- 区分专业解释（professional_explanation）与白话解释（plain_language_explanation）
- 不使用「必涨／必跌／绝对／100%／保证」等绝对化语言
- 不得给出买入／卖出／目标价／止损价等交易指令，仅限研究观察
- 相对强弱（跑赢／跑输）必须对比基准（QQQ / SPY / 大盘）
- 含 13F／ARK 等 smart money 数据时必须标注季度延迟与价格确认

当用户要求"分析某标的"或"复盘"时，调用 saveHypothesis 工具保存结论；
saveHypothesis 的字段（claim、evidence_for 等）即 hypotheses 表的必填 JSON 字段。`;

export const LONGBRIDGE_AGENT_PROMPT_PATCH = `

Longbridge CLI 工具（TRADER_LONGBRIDGE_AGENT=on 且本机已登录时可用）：
- 具体客观事实（现价、盘口、K 线、财报、新闻、估值、筛选、持仓快照）优先使用 getLongbridge* / longbridgeInvoke，不要用 getMarketBars(limit=1) 代替实时价。
- 本系统信号、scan、ingest、buildContext、saveHypothesis、Lesson 仍使用 intel 工具；不得仅凭长桥数据写入假设，除非用户要求对比。
- 禁止请求任何下单、撤单、出入金；工具集不提供交易写操作。
- 单轮对话内对长桥工具调用 ≤ 10 次（避免 rate limit）。
- 工具返回 { ok:false } 时不要用相同 args 重试；改用 intel 工具或如实告知用户问题。`;

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function getSystemPromptWithLongbridge(): string {
  return SYSTEM_PROMPT + LONGBRIDGE_AGENT_PROMPT_PATCH;
}

export const INTEL_TOOLS = {
  ingestMarketData: tool({
    description: `批量拉取预设关注列表（${PREFERRED_SYMBOLS_LABEL}）行情（日线+5m）。其他代码请用 ingestSymbolBars`,
    parameters: z.object({}),
    execute: async () => fetchIntel("/market/ingest", { method: "POST" }),
  }),

  ingestSymbolBars: tool({
    description:
      "拉取单个标的行情（日线+5m）并写入 DB；分析任意 ticker 前若 getMarketBars 无数据必须先调用",
    parameters: z.object({
      symbol: z.string().describe("任意合法代码，如 AAPL"),
      force: z
        .boolean()
        .optional()
        .describe("true 时跳过 TTL，强制增量补齐"),
    }),
    execute: async ({ symbol, force }) => ingestSymbol(symbol, { force: force ?? false }),
  }),

  getMarketBars: tool({
    description: "查询任意标的的历史 K 线（无 universe 限制）",
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
    description: `对预设关注列表（${PREFERRED_SYMBOLS_LABEL}）批量特征扫描；不限制你只能分析这些代码`,
    parameters: z.object({}),
    execute: async () => fetchIntel("/signals/scan", { method: "POST" }),
  }),

  buildContext: tool({
    description:
      "为 LLM 组装结构化上下文包，包含行情、信号、复盘 lesson、事件、语料检索结果的统一 JSON 视图",
    parameters: z.object({
      symbols: z
        .array(z.string())
        .describe("任意标的列表，如 ['AAPL'] 或 ['TSLA','NVDA']"),
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

  getRelatedHypotheses: tool({
    description: "获取同标的的历史假设（最近 N 条），用于连续跟踪分析",
    parameters: z.object({
      symbol: z.string(),
      limit: z.number().default(3),
    }),
    execute: async ({ symbol, limit }) =>
      fetchIntel(`/hypotheses?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
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
