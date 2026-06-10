/**
 * Longbridge 组工具 — 实时行情与基本面
 *
 * 注册 toolRegistry 中的 longbridge 组工具。
 * 导入现有的 createLongbridgeTools() 并逐个注册。
 */

import type { ToolDef } from "./toolRegistry.js";
import { createLongbridgeTools } from "./longbridgeTools.js";

export function createLongbridgeDefs(): ToolDef[] {
  const tools = createLongbridgeTools();
  const defs: ToolDef[] = [];

  const summaries: Record<string, string> = {
    getLongbridgeQuote: "最新报价、涨跌幅、量额、盘前盘后。",
    getLongbridgeKline: "OHLCV K 线（日线/分钟线）。",
    getLongbridgeIntraday: "当日分时价量数据。",
    getLongbridgeDepth: "盘口深度数据（买卖挂单）。",
    getLongbridgeTrade: "逐笔成交明细。",
    getLongbridgeBroker: "经纪商买卖统计。",
    getLongbridgeCapitalFlow: "资金流向数据。",
    getLongbridgeCapitalIntraday: "日内实时资金流向。",
    getLongbridgeBasicInfo: "公司基本信息（名称、行业、市值等）。",
    getLongbridgeFinancial: "财务报表数据（营收、利润等）。",
    getLongbridgeEarnings: "财报日历与历史 EPS。",
    getLongbridgeEstimate: "分析师一致预期。",
    getLongbridgeNews: "相关新闻列表。",
    getLongbridgeAnnouncement: "公司公告。",
    getLongbridgeInsider: "内部人交易记录。",
    getLongbridgeInstitutional: "机构持仓变动。",
    getLongbridgeShortSelling: "做空数据。",
    getLongbridgeWarrant: "窝轮/牛熊证数据（港股）。",
    getLongbridgeAH: "AH 股溢价数据。",
    getLongbridgeADR: "ADR 溢价数据。",
    getLongbridgeOption: "期权链数据。",
    getLongbridgeMarketStatus: "市场开盘/收盘状态。",
  };

  for (const [name, impl] of Object.entries(tools)) {
    defs.push({
      name,
      group: "longbridge",
      summary: summaries[name] ?? "长桥实时数据。",
      implementation: impl,
    });
  }

  return defs;
}
