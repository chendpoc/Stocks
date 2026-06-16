import { tool } from "ai";
import { z } from "zod";
import { runLongbridgeJson } from "../../services/longbridgeCli.js";
import type { ToolDef } from "../toolRegistry.js";

/** Positions, portfolio, assets, watchlist (original order 19–22). */
export const ACCOUNT_TOOLS: ToolDef[] = [
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
];
