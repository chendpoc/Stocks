import { tool } from "ai";
import { z } from "zod";
import { toLongbridgeSymbol } from "../../services/longbridge.js";
import { runLongbridgeJson } from "../../services/longbridgeCli.js";
import type { ToolDef } from "../toolRegistry.js";
import { sym, symTool } from "./helpers.js";

/** Quote through capital (original order positions 1–6). */
export const MARKET_DATA_TOOLS: ToolDef[] = [
  {
    name: "getLongbridgeQuote",
    group: "longbridge",
    summary: "最新报价、涨跌幅、量额、盘前盘后。",
    implementation: tool({
      description:
        "【长桥·实时客观】最新报价、涨跌幅、量额、盘前盘后。" +
        "查现在多少钱、批量比价（≤10 symbol）优先本工具。" +
        "客观行情事实优先长桥而非 intel DB。",
      parameters: z
        .object({
          symbol: z.string().optional().describe("单 symbol，如 TSLA 或 TSLA.US"),
          symbols: z.array(z.string()).optional().describe("批量 symbol（≤10）"),
        })
        .refine((v) => !!v.symbol || (v.symbols != null && v.symbols.length > 0), {
          message: "必须提供 symbol 或 symbols",
        }),
      execute: async ({ symbol, symbols }) => {
        const list = symbols && symbols.length > 0 ? symbols : [symbol!];
        if (list.length > 10) {
          return {
            ok: false as const,
            code: "MULTI_SYMBOL_LIMIT",
            message: "最多同时查询 10 个 symbol",
          };
        }
        return runLongbridgeJson("quote", list.map(toLongbridgeSymbol));
      },
    }),
  },
  {
    name: "getLongbridgeKline",
    group: "longbridge",
    summary: "OHLCV K 线（日线/分钟线）。",
    implementation: tool({
      description:
        "【长桥·实时客观】OHLCV K 线。默认日线最近 60 根。历史 K 线优先本工具；本系统特征扫描仍用 intel ingest。",
      parameters: z.object({
        symbol: sym,
        period: z.enum(["1m", "5m", "15m", "30m", "60m", "day", "week", "month"]).default("day"),
        count: z.number().min(1).max(500).default(60),
      }),
      execute: async ({ symbol, period, count }) =>
        runLongbridgeJson("kline", [
          toLongbridgeSymbol(symbol),
          "--period", period,
          "--count", String(count),
        ]),
    }),
  },
  {
    name: "getLongbridgeIntraday",
    group: "longbridge",
    summary: "当日分时价量数据。",
    implementation: symTool(
      "【长桥·实时客观】当日（或指定日）分时价量。",
      "intraday",
      { date: z.string().optional().describe("YYYY-MM-DD，默认今日") },
      (p) => (p.date ? ["--date", String(p.date)] : []),
    ),
  },
  {
    name: "getLongbridgeDepth",
    group: "longbridge",
    summary: "盘口深度数据（买卖挂单）。",
    implementation: symTool("【长桥·实时客观】买卖盘口深度。", "depth"),
  },
  {
    name: "getLongbridgeTrades",
    group: "longbridge",
    summary: "逐笔成交明细。",
    implementation: tool({
      description: "【长桥·实时客观】最近逐笔成交。",
      parameters: z.object({
        symbol: sym,
        count: z.number().min(1).max(500).default(50),
      }),
      execute: async ({ symbol, count }) =>
        runLongbridgeJson("trades", [
          toLongbridgeSymbol(symbol),
          "--count", String(count),
        ]),
    }),
  },
  {
    name: "getLongbridgeCapital",
    group: "longbridge",
    summary: "资金流向/分布；可选分时序列。",
    implementation: tool({
      description: "【长桥·客观】资金流向/分布；可选分时序列。",
      parameters: z.object({
        symbol: sym,
        flow: z.boolean().optional().describe("true 时加 --flow"),
      }),
      execute: async ({ symbol, flow }) => {
        const args = [toLongbridgeSymbol(symbol)];
        if (flow) args.push("--flow");
        return runLongbridgeJson("capital", args);
      },
    }),
  },
];

/** Market temp + status (original order positions 17–18). */
export const MARKET_OVERVIEW_TOOLS: ToolDef[] = [
  {
    name: "getLongbridgeMarketTemp",
    group: "longbridge",
    summary: "市场情绪温度指数 0–100。",
    implementation: tool({
      description: "【长桥·客观】市场情绪温度指数 0–100。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("market-temp", []),
    }),
  },
  {
    name: "getLongbridgeMarketStatus",
    group: "longbridge",
    summary: "各交易所开闭市状态。",
    implementation: tool({
      description: "【长桥·客观】各交易所开闭市状态。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("market-status", []),
    }),
  },
];
