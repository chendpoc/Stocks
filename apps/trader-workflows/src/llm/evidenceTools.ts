import { tool, type CoreTool } from "ai";
import { z } from "zod";

import { fetchIntel } from "../api/client.js";

/** §3.2 evidence 白名单 — market + sentiment + memory（prompt 对齐命名） */
export function resolveEvidenceTools(): Record<string, CoreTool> {
  return {
    fetchMarketBars: tool({
      description: "查询标的 K 线（1d / 5m）",
      parameters: z.object({
        symbol: z.string(),
        timeframe: z.enum(["1d", "5m"]).default("5m"),
        limit: z.number().default(20),
      }),
      execute: async ({ symbol, timeframe, limit }) =>
        fetchIntel(
          `/market/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
        ),
    }),

    fetchBenchmarkBars: tool({
      description: "查询基准指数/ETF K 线（如 QQQ、SPY）",
      parameters: z.object({
        symbol: z.string().default("QQQ"),
        timeframe: z.enum(["1d", "5m"]).default("5m"),
        limit: z.number().default(20),
      }),
      execute: async ({ symbol, timeframe, limit }) =>
        fetchIntel(
          `/market/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
        ),
    }),

    searchRecentEvents: tool({
      description: "搜索结构化事件（财报、宏观数据等）",
      parameters: z.object({
        symbol: z.string(),
        windowMinutes: z.number().default(30),
      }),
      execute: async ({ symbol, windowMinutes }) =>
        fetchIntel("/tools/recent-events", {
          method: "POST",
          body: JSON.stringify({ symbol, windowMinutes }),
        }).catch((error) => ({
          unavailable: true,
          tool: "searchRecentEvents",
          error: error instanceof Error ? error.message : String(error),
        })),
    }),

    fetchOptionFlow: tool({
      description: "查询期权流（大单方向、put/call）",
      parameters: z.object({
        symbol: z.string(),
        windowMinutes: z.number().default(30),
      }),
      execute: async ({ symbol, windowMinutes }) =>
        fetchIntel("/tools/option-flow", {
          method: "POST",
          body: JSON.stringify({ symbol, windowMinutes }),
        }).catch(() => ({
          unavailable: true,
          tool: "fetchOptionFlow",
        })),
    }),

    webSearch: tool({
      description: "英文新闻/公告搜索（结果需 fetchUrl 验证）",
      parameters: z.object({
        query: z.string(),
        maxResults: z.number().default(5),
      }),
      execute: async ({ query, maxResults }) =>
        fetchIntel("/tools/web-search", {
          method: "POST",
          body: JSON.stringify({ query, maxResults }),
        }).catch((error) => ({
          unavailable: true,
          tool: "webSearch",
          error: error instanceof Error ? error.message : String(error),
        })),
    }),

    fetchUrl: tool({
      description: "抓取 URL 正文以验证搜索摘要",
      parameters: z.object({
        url: z.string(),
      }),
      execute: async ({ url }) =>
        fetchIntel("/tools/fetch-url", {
          method: "POST",
          body: JSON.stringify({ url }),
        }).catch((error) => ({
          unavailable: true,
          tool: "fetchUrl",
          error: error instanceof Error ? error.message : String(error),
        })),
    }),

    queryPatternHistory: tool({
      description: "查询标的 + setup 的历史 pattern-memory",
      parameters: z.object({
        symbol: z.string(),
        setupName: z.string(),
        limit: z.number().default(3),
      }),
      execute: async ({ symbol, setupName, limit }) => {
        const params = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          pattern_id: setupName,
          limit: String(limit),
        });
        return fetchIntel(`/market-agent/pattern-memory?${params.toString()}`).catch(
          (error) => ({
            unavailable: true,
            tool: "queryPatternHistory",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      },
    }),
  };
}
