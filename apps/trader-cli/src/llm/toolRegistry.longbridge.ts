/**
 * Longbridge 组工具 — 实时行情与基本面（22 个工具）
 *
 * 直接注册到 toolRegistry，不走 legacy createLongbridgeTools() 包裹。
 * 工具按类型分三组：行情类 (quote/kline/intraday/depth/trades)、
 * 基本面类 (static/calc-index/news/financial-report/valuation...)、
 * 账户类 (positions/portfolio/assets/watchlist)。
 *
 * 设计依据: 14_llm_reasoning_strategy.md §3.2 行情组
 */

import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { toLongbridgeSymbol } from "../services/longbridge.js";
import {
  runLongbridgeJson,
  validateLongbridgeInvoke,
} from "../services/longbridgeCli.js";
import type { ToolDef } from "./toolRegistry.js";

const sym = z.string().describe("标的代码，如 TSLA（无后缀补 .US）");

function symTool(
  description: string,
  command: string,
  extra?: z.ZodRawShape,
  buildExtra?: (p: Record<string, unknown>) => string[],
): CoreTool {
  const shape = { symbol: sym, ...extra };
  return tool({
    description,
    parameters: z.object(shape),
    execute: async (params) => {
      const p = params as Record<string, unknown>;
      const args = [toLongbridgeSymbol(String(p.symbol))];
      if (buildExtra) args.push(...buildExtra(p));
      return runLongbridgeJson(command, args);
    },
  }) as CoreTool;
}

export const LONGBRIDGE_TOOLS: ToolDef[] = [
  // ─── 行情类 ──────────────────────────────────────────

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

  // ─── 基本面类 ──────────────────────────────────────

  {
    name: "getLongbridgeStatic",
    group: "longbridge",
    summary: "证券静态信息（名称、每手、币种等）。",
    implementation: symTool("【长桥·客观】证券静态信息（名称、每手、币种等）。", "static"),
  },

  {
    name: "getLongbridgeCalcIndex",
    group: "longbridge",
    summary: "计算类指标（PE/PB/换手率等）。",
    implementation: symTool("【长桥·客观】计算类指标（PE/PB/换手率等）。", "calc-index"),
  },

  {
    name: "getLongbridgeNews",
    group: "longbridge",
    summary: "相关新闻列表。",
    implementation: tool({
      description: "【长桥·客观】标的最新新闻列表。",
      parameters: z.object({
        symbol: sym,
        count: z.number().min(1).max(100).default(20),
      }),
      execute: async ({ symbol, count }) =>
        runLongbridgeJson("news", [
          toLongbridgeSymbol(symbol),
          "--count", String(count),
        ]),
    }),
  },

  {
    name: "getLongbridgeFinancialReport",
    group: "longbridge",
    summary: "财务报表数据（营收、利润等）。",
    implementation: tool({
      description: "【长桥·客观】财报（利润表/资产负债表/现金流）。",
      parameters: z.object({
        symbol: sym,
        reportType: z.enum(["income", "balance", "cashflow"]).default("income"),
        period: z.string().optional().describe("报告期，如 2024-12-31"),
      }),
      execute: async ({ symbol, reportType, period }) => {
        const args = [toLongbridgeSymbol(symbol), "--type", reportType];
        if (period) args.push("--period", period);
        return runLongbridgeJson("financial-report", args, { timeoutMs: 60_000 });
      },
    }),
  },

  {
    name: "getLongbridgeValuation",
    group: "longbridge",
    summary: "估值分析（PE/PB/PS、股息、同业对比）。",
    implementation: symTool("【长桥·客观】估值分析（PE/PB/PS、股息、同业对比）。", "valuation"),
  },

  {
    name: "getLongbridgeConsensus",
    group: "longbridge",
    summary: "一致预期财务细节。",
    implementation: symTool("【长桥·客观】一致预期财务细节。", "consensus"),
  },

  {
    name: "getLongbridgeForecastEps",
    group: "longbridge",
    summary: "EPS 预测与分析师共识。",
    implementation: symTool("【长桥·客观】EPS 预测与分析师共识。", "forecast-eps"),
  },

  {
    name: "getLongbridgeDividend",
    group: "longbridge",
    summary: "分红历史与细节。",
    implementation: symTool("【长桥·客观】分红历史与细节。", "dividend"),
  },

  {
    name: "getLongbridgeScreener",
    group: "longbridge",
    summary: "策略选股/筛选结果。",
    implementation: tool({
      description: "【长桥·客观】策略选股/筛选结果（只读查询）。",
      parameters: z.object({
        strategy: z.string().describe("策略 id 或名称，见 longbridge screener --help"),
        limit: z.number().min(1).max(200).default(30),
      }),
      execute: async ({ strategy, limit }) =>
        runLongbridgeJson("screener", [strategy, "--limit", String(limit)], {
          timeoutMs: 60_000,
        }),
    }),
  },

  {
    name: "getLongbridgeCompare",
    group: "longbridge",
    summary: "多标的估值对比（最多 5 个）。",
    implementation: tool({
      description: "【长桥·客观】多标的估值对比（最多 5 个）。",
      parameters: z.object({
        symbols: z.array(z.string()).min(1).max(5),
      }),
      execute: async ({ symbols }) =>
        runLongbridgeJson("compare", symbols.map((s) => toLongbridgeSymbol(s))),
    }),
  },

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

  // ─── 账户类 ──────────────────────────────────────

  {
    name: "getLongbridgePositions",
    group: "longbridge",
    summary: "当前股票持仓快照（只读）。",
    implementation: tool({
      description: "【长桥·客观】当前股票持仓快照。账户数据；不提供下单。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("positions", []),
    }),
  },

  {
    name: "getLongbridgePortfolio",
    group: "longbridge",
    summary: "组合概览（资产、盈亏、持仓摘要）。",
    implementation: tool({
      description: "【长桥·客观】组合概览（资产、盈亏、持仓摘要）。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("portfolio", []),
    }),
  },

  {
    name: "getLongbridgeAssets",
    group: "longbridge",
    summary: "账户资产、购买力、保证金概览。",
    implementation: tool({
      description: "【长桥·客观】账户资产、购买力、保证金概览。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("assets", []),
    }),
  },

  {
    name: "listLongbridgeWatchlist",
    group: "longbridge",
    summary: "自选分组列表（只读）。",
    implementation: tool({
      description: "【长桥·客观】自选分组列表（只读，不含 create/delete）。",
      parameters: z.object({}),
      execute: async () => runLongbridgeJson("watchlist", []),
    }),
  },

  {
    name: "longbridgeInvoke",
    group: "longbridge",
    summary: "调用白名单内只读 CLI 子命令。",
    implementation: tool({
      description:
        "【长桥·网关】调用白名单内只读 CLI 子命令（--format json）。禁止 order/交易。Tier1 已覆盖的命令请用具名工具。",
      parameters: z.object({
        command: z.string().describe("顶层子命令，如 option、filing、rank"),
        args: z
          .array(z.string())
          .optional()
          .describe("子命令参数，勿含 buy/sell/create 等"),
      }),
      execute: async ({ command, args }) => {
        const err = validateLongbridgeInvoke(command, args ?? []);
        if (err) return err;
        return runLongbridgeJson(command, args ?? []);
      },
    }),
  },
];
