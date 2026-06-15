/**
 * Watchlist 数据服务
 *
 * 直接调用 longbridge CLI 获取自选股列表、实时报价、静态信息。
 * TUI 组件通过本模块消费数据，不经过 LLM 工具层。
 */
import { runLongbridgeJson, type LongbridgeCliResult } from "./longbridgeCli.js";
import { toLongbridgeSymbol } from "./longbridge.js";

/* ───────── 类型定义 ───────── */

export interface WatchlistStock {
  symbol: string;       // 原始 symbol (如 AAPL)
  lbSymbol: string;     // 长桥格式 (如 AAPL.US)
  name: string;         // 名称
  market: string;       // 市场: US / HK / CN / SG
  groupName?: string;   // 所属自选分组名
  tag?: string;         // 标签/备注
  position?: number;    // 排序位置
}

export interface WatchlistQuote {
  symbol: string;
  price: string;        // 最新价
  change: string;       // 涨跌额
  changePct: string;    // 涨跌幅 (含 %)
  high: string;
  low: string;
  volume: string;
  color: "green" | "red" | "gray";  // 涨/跌/平
}

export interface WatchlistGroup {
  name: string;
  stocks: WatchlistStock[];
}

export interface WatchlistLoadResult {
  groups: WatchlistGroup[];
  quotes: Map<string, WatchlistQuote>;
  loadedAt: number;
  error?: string;
}

/* ───────── 数据加载 ───────── */

/** 解析 longbridge quote JSON 输出为 WatchlistQuote */
function parseQuoteResult(raw: unknown): WatchlistQuote | null {
  if (raw === null || raw === undefined) return null;
  const r = raw as Record<string, unknown>;
  const symbol = String(r.symbol ?? r.code ?? "");
  const price = Number(r.price ?? r.last_done ?? r.current ?? 0);
  const change = Number(r.change ?? r.net_change ?? 0);
  const changePct = Number(r.change_percent ?? r.change_ratio ?? r.pct_chg ?? 0);

  return {
    symbol,
    price: price > 0 ? price.toFixed(2) : "--",
    change: change !== 0 ? (change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2)) : "0.00",
    changePct: changePct !== 0
      ? (changePct > 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`)
      : "0.00%",
    high: String(r.high ?? r.day_high ?? "--"),
    low: String(r.low ?? r.day_low ?? "--"),
    volume: formatVolume(Number(r.volume ?? r.total_volume ?? 0)),
    color: change > 0 ? "green" : change < 0 ? "red" : "gray",
  };
}

function formatVolume(v: number): string {
  if (!v || v <= 0) return "--";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

/** 解析 longbridge watchlist JSON 输出为 WatchlistGroup[] */
function parseWatchlistResult(raw: unknown): WatchlistGroup[] {
  if (!raw) return [];

  // 可能格式：{ groups: [{ name, securities: [{ symbol, market, ... }] }] }
  // 或 [{ name, securities: [...] }]
  const root: unknown[] = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown>).groups as unknown[]) ?? [];

  return root.map((g: unknown) => {
    const group = g as Record<string, unknown>;
    const securities = (Array.isArray(group.securities) ? group.securities : []) as Record<string, unknown>[];
    return {
      name: String(group.name ?? group.group_name ?? "默认"),
      stocks: securities.map((s, i) => ({
        symbol: String(s.symbol ?? s.code ?? ""),
        lbSymbol: toLongbridgeSymbol(String(s.symbol ?? s.code ?? "")),
        name: String(s.name ?? s.name_cn ?? s.symbol ?? ""),
        market: String(s.market ?? s.exchange ?? "US").toUpperCase(),
        groupName: String(group.name ?? group.group_name ?? "默认"),
        tag: String(s.tag ?? s.note ?? s.remark ?? ""),
        position: i,
      })),
    };
  }).filter(g => g.stocks.length > 0);
}

/** 加载自选股列表 */
export async function loadWatchlist(): Promise<WatchlistGroup[]> {
  const result = await runLongbridgeJson("watchlist", [], { timeoutMs: 20_000 });
  if (!result.ok) {
    console.error("loadWatchlist failed:", result.message);
    return [];
  }
  return parseWatchlistResult(result.data);
}

/** 批量获取实时报价 */
export async function loadQuotes(
  symbols: string[],
): Promise<Map<string, WatchlistQuote>> {
  const map = new Map<string, WatchlistQuote>();
  if (symbols.length === 0) return map;

  // 长桥 quote 支持批量，但最多 10 个一批
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const result = await runLongbridgeJson("quote", batch, { timeoutMs: 15_000 });
    if (!result.ok) {
      console.error(`loadQuotes batch ${i} failed:`, result.message);
      continue;
    }
    // quote 可能返回单对象或数组
    const items: unknown[] = Array.isArray(result.data) ? result.data : [result.data];
    for (const item of items) {
      const q = parseQuoteResult(item);
      if (q) map.set(q.symbol, q);
    }
  }
  return map;
}

/** 批量获取静态信息（名称等） */
export async function loadStaticInfo(
  symbols: string[],
): Promise<Map<string, { name: string }>> {
  const map = new Map<string, { name: string }>();
  for (const sym of symbols) {
    const result = await runLongbridgeJson("static", [toLongbridgeSymbol(sym)], {
      timeoutMs: 12_000,
    });
    if (result.ok && result.data) {
      const d = result.data as Record<string, unknown>;
      map.set(sym, { name: String(d.name ?? d.name_cn ?? sym) });
    }
  }
  return map;
}

/** 完整加载 watchlist（列表 + 报价 + 名称） */
export async function loadWatchlistFull(): Promise<WatchlistLoadResult> {
  const groups = await loadWatchlist();
  if (groups.length === 0) {
    return {
      groups: [],
      quotes: new Map(),
      loadedAt: Date.now(),
      error: "自选列表为空或加载失败",
    };
  }

  const allStocks = groups.flatMap(g => g.stocks);
  const lbSymbols = allStocks.map(s => s.lbSymbol);

  // 批量获取报价和静态信息
  const [quotes, staticInfo] = await Promise.all([
    loadQuotes(lbSymbols),
    loadStaticInfo(lbSymbols).catch<Map<string, { name: string }>>(() => new Map()),
  ]);

  // 用静态信息补全名称
  for (const stock of allStocks) {
    const info = staticInfo.get(stock.lbSymbol);
    if (info && info.name && stock.name === stock.symbol) {
      stock.name = info.name;
    }
  }

  return { groups, quotes, loadedAt: Date.now() };
}
