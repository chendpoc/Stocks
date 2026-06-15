/**
 * Market 组工具 — 行情读取与信号扫描
 *
 * 注册 toolRegistry 中的 market 组工具。
 * 这些工具提供行情数据、信号扫描和上下文组装能力。
 */

import { tool } from "ai";
import { z } from "zod";
import { safeFetchIntel } from "../api/client.js";
import { ingestSymbol } from "../services/market.js";
import { PREFERRED_SYMBOLS_LABEL } from "../symbols.js";
import type { ToolDef } from "./toolRegistry.js";

export const MARKET_TOOLS: ToolDef[] = [
  {
    name: "ingestMarketData",
    group: "market",
    summary: `批量拉取预设关注列表（${PREFERRED_SYMBOLS_LABEL}）行情（日线+5m）。`,
    implementation: tool({
      description: `批量拉取预设关注列表（${PREFERRED_SYMBOLS_LABEL}）行情（日线+5m）。其他代码请用 ingestSymbolBars`,
      parameters: z.object({}),
      execute: async () => safeFetchIntel("/market/ingest", { method: "POST" }),
    }),
  },

  {
    name: "ingestSymbolBars",
    group: "market",
    summary: "拉取单个标的行情（日线+5m）并写入 DB。",
    implementation: tool({
      description:
        "拉取单个标的行情（日线+5m）并写入 DB；分析任意 ticker 前若 getMarketBars 无数据必须先调用",
      parameters: z.object({
        symbol: z.string().describe("任意合法代码，如 AAPL"),
        force: z.boolean().optional().describe("true 时跳过 TTL，强制增量补齐"),
      }),
      execute: async ({ symbol, force }) =>
        ingestSymbol(symbol, { force: force ?? false }),
    }),
  },

  {
    name: "getMarketBars",
    group: "market",
    summary: "查询任意标的的历史 K 线（日线/5m）。",
    implementation: tool({
      description: "查询任意标的的历史 K 线（无 universe 限制）",
      parameters: z.object({
        symbol: z.string().describe("标的代码，如 TSLA"),
        timeframe: z.enum(["1d", "5m"]).default("1d"),
        limit: z.number().default(20),
      }),
      execute: async ({ symbol, timeframe, limit }) =>
        safeFetchIntel(
          `/market/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
        ),
    }),
  },

  {
    name: "getSignals",
    group: "market",
    summary: "查询已生成的信号列表，可按标的与状态过滤。",
    implementation: tool({
      description: "查询已生成的信号列表，可按标的与状态过滤",
      parameters: z.object({
        symbol: z.string().optional(),
        status: z
          .enum(["new", "explained", "verified", "invalidated"])
          .optional(),
        limit: z.number().default(50),
      }),
      execute: async ({ symbol, status, limit }) => {
        const params = new URLSearchParams();
        if (symbol) params.set("symbol", symbol);
        if (status) params.set("status", status);
        params.set("limit", String(limit));
        return safeFetchIntel(`/signals?${params.toString()}`);
      },
    }),
  },

  {
    name: "scanSignals",
    group: "market",
    summary: `对预设关注列表（${PREFERRED_SYMBOLS_LABEL}）批量特征扫描。`,
    implementation: tool({
      description: `对预设关注列表（${PREFERRED_SYMBOLS_LABEL}）批量特征扫描；不限制你只能分析这些代码`,
      parameters: z.object({}),
      execute: async () => safeFetchIntel("/signals/scan", { method: "POST" }),
    }),
  },

  {
    name: "buildContext",
    group: "market",
    summary: "为 LLM 组装结构化上下文包，包含行情、信号、lesson、事件、语料。",
    implementation: tool({
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
        safeFetchIntel("/context/build", {
          method: "POST",
          body: JSON.stringify(params),
        }),
    }),
  },

  {
    name: "fetchRegime",
    group: "market",
    summary: "获取当前市场状态（trending/ranging/volatile）— Gate 决策和 Agent 路由的基础。",
    implementation: tool({
      description:
        "获取当前全市场 Regime 判定。返回: 状态(trending|ranging|volatile)、置信度、关键指标(ADX/VIX/Bollinger)、转换风险。" +
        "Gate 决策必须基于 Regime——不同市场状态下应路由到不同 Agent。",
      parameters: z.object({}),
      execute: async () => safeFetchIntel("/market-agent/regime"),
    }),
  },

  {
    name: "getEvents",
    group: "market",
    summary: "查询某标的近期的新闻、宏观与社群事件。",
    implementation: tool({
      description: "查询某标的近期的新闻、宏观与社群事件",
      parameters: z.object({
        symbol: z.string().optional(),
        days: z.number().default(7),
        limit: z.number().default(20),
      }),
      execute: async ({ symbol, days, limit }) => {
        const params = new URLSearchParams({
          days: String(days),
          limit: String(limit),
        });
        if (symbol) params.set("symbol", symbol);
        return safeFetchIntel(`/events?${params.toString()}`);
      },
    }),
  },
];
