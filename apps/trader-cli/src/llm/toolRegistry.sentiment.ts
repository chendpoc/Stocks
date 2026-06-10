/**
 * Sentiment 组工具 — 舆情搜索与验证
 *
 * 注册 toolRegistry 中的 sentiment 组工具。
 * 设计依据: 14_llm_reasoning_strategy.md §3.2 舆情组
 *
 * 实现说明:
 * - webSearch / searchCnFinance 目前为预置接口，需对接实际搜索 API
 * - fetchUrl 使用 fetchIntel() 通过 Backend 做 HTTP 代理（避免前端跨域 + IP 限制）
 */

import { tool } from "ai";
import { z } from "zod";
import { fetchIntel } from "../../api/client.js";
import type { ToolDef } from "./toolRegistry.js";

export const SENTIMENT_TOOLS: ToolDef[] = [
  {
    name: "webSearch",
    group: "sentiment",
    summary: "搜索英文新闻/公告/社交媒体（≤5 条结果）。",
    implementation: tool({
      description:
        "搜索 Web 获取新闻、公告、社交媒体信息。搜索结果未经原文验证——关键内容需调用 fetchUrl 验证后引用。",
      parameters: z.object({
        query: z.string().describe("搜索查询，如 'TSLA earnings guidance Q2 2026'"),
        maxResults: z.number().default(5).describe("最大结果数（1-5）"),
      }),
      execute: async ({ query, maxResults }) =>
        fetchIntel("/tools/web-search", {
          method: "POST",
          body: JSON.stringify({ query, maxResults }),
        }),
    }),
  },

  {
    name: "searchCnFinance",
    group: "sentiment",
    summary: "中文金融源搜索（雪球/东财/36氪）——A/港股标的必需。",
    implementation: tool({
      description:
        "搜索中文金融源（雪球、东方财富、36氪）。研究 A 股/港股/中概股必须优先使用此工具获取一手中文信息。",
      parameters: z.object({
        symbol: z.string().describe("标的代码"),
        source: z
          .enum(["xueqiu", "eastmoney", "36kr", "auto"])
          .default("auto")
          .describe("数据源，auto 自动选择"),
      }),
      execute: async ({ symbol, source }) =>
        fetchIntel("/tools/search-cn-finance", {
          method: "POST",
          body: JSON.stringify({ symbol, source }),
        }),
    }),
  },

  {
    name: "fetchUrl",
    group: "sentiment",
    summary: "访问具体页面提取正文——验证搜索摘要是否与原文一致。",
    implementation: tool({
      description:
        "访问一个 URL 并提取正文内容。用于验证搜索结果——搜索摘要可能断章取义，原文才是真相。每次 search 后应至少验证 1 个结果。",
      parameters: z.object({
        url: z.string().describe("要访问的完整 URL"),
      }),
      execute: async ({ url }) =>
        fetchIntel("/tools/fetch-url", {
          method: "POST",
          body: JSON.stringify({ url }),
        }),
    }),
  },

  {
    name: "searchRecentEvents",
    group: "sentiment",
    summary: "搜索结构化事件（财报日、FOMC、经济数据发布）。",
    implementation: tool({
      description: "搜索某标的相关结构化事件：财报日、FOMC 会议、经济数据发布",
      parameters: z.object({
        symbol: z.string(),
        windowMinutes: z.number().default(30),
      }),
      execute: async ({ symbol, windowMinutes }) =>
        fetchIntel("/tools/recent-events", {
          method: "POST",
          body: JSON.stringify({ symbol, windowMinutes }),
        }),
    }),
  },
];
