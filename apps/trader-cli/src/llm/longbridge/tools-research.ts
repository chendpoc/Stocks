import { tool } from "ai";
import { z } from "zod";
import { toLongbridgeSymbol } from "../../services/longbridge.js";
import { runLongbridgeJson } from "../../services/longbridgeCli.js";
import type { ToolDef } from "../toolRegistry.js";
import { sym, symTool } from "./helpers.js";

/** Static through compare (original order positions 7–16). */
export const RESEARCH_TOOLS: ToolDef[] = [
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
];
