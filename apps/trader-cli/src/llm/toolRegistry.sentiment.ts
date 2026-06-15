/**
 * Sentiment 组工具 — 舆情搜索与验证
 *
 * 注册 toolRegistry 中的 sentiment 组工具。
 * 设计依据: 14_llm_reasoning_strategy.md §3.2 舆情组
 *
 * 实现说明:
 * - webSearch / searchCnFinance 目前为预置接口，需对接实际搜索 API
 * - fetchUrl 使用 safeFetchIntel() 通过 Backend 做 HTTP 代理（避免前端跨域 + IP 限制）
 */

import { tool } from "ai";
import { z } from "zod";
import { safeFetchIntel } from "../api/client.js";
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
        safeFetchIntel("/tools/web-search", {
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
        safeFetchIntel("/tools/search-cn-finance", {
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
        safeFetchIntel("/tools/fetch-url", {
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
        safeFetchIntel("/tools/recent-events", {
          method: "POST",
          body: JSON.stringify({ symbol, windowMinutes }),
        }),
    }),
  },

  {
    name: "extractNewsSignal",
    group: "sentiment",
    summary: "从财经新闻文本中结构化提取交易相关信号（事件类型/情感/关键点）。",
    implementation: tool({
      description:
        "从新闻文本中提取交易相关的结构化信号。输入一段财经新闻（英文或中文），" +
        "返回: 事件类型（earnings/product/macro/analyst）、细粒度情感（revenue:0.8, china_iphone:-0.7）、" +
        "交易信号（bullish/bearish/mixed/neutral）、置信度。" +
        "用于: webSearch 返回的新闻在引用前先提取信号——判断这条新闻对交易的实质影响。",
      parameters: z.object({
        text: z.string().describe("新闻文本（中文或英文）"),
        symbol: z.string().optional().describe("关联标的代码，帮助识别公司引用"),
      }),
      execute: async ({ text, symbol }) =>
        safeFetchIntel("/tools/extract-news-signal", {
          method: "POST",
          body: JSON.stringify({ text, symbol }),
        }),
    }),
  },

  {
    name: "analyzeSentiment",
    group: "sentiment",
    summary: "社交媒体散户情绪分析（X/Twitter/StockTwits/Reddit）— 极端情绪时参考价值最高。",
    implementation: tool({
      description:
        "搜索社交媒体上散户对某标的最新讨论，返回情绪信号和讨论量趋势。" +
        "散户情绪在极端一致时最有参考价值（一边倒看涨 → 警惕过热；一边倒看跌 → 关注反转）。" +
        "结果包含: 最近讨论摘要、24h 讨论量变化、平台分布。" +
        "你需要自行判断情绪方向——工具只提供原始数据和基础统计，不替你下结论。",
      parameters: z.object({
        symbol: z.string().describe("标的代码，如 TSLA"),
        platforms: z
          .array(z.enum(["x", "stocktwits", "reddit"]))
          .default(["x"])
          .describe("社交平台列表。默认 ['x']，可选追加 stocktwits 和 reddit。"),
      }),
      execute: async ({ symbol, platforms }) =>
        safeFetchIntel("/tools/analyze-sentiment", {
          method: "POST",
          body: JSON.stringify({ symbol, platforms }),
        }),
    }),
  },
];
