/**
 * WatchlistPage — 自选股总览 + 个股详情
 *
 * 两个视图：
 *   1. 总览：5 列表格（代码 | 名称 | 现价 | 涨跌 | 标签）
 *   2. 个股详情：4 标签页切换（总览 | 个股对比 | 持仓笔记 | 信号与探索）
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  loadWatchlistFull,
  type WatchlistGroup,
  type WatchlistQuote,
  type WatchlistStock,
} from "../../services/watchlist.js";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { SpinnerLine } from "../components/SpinnerLine.js";
import { ActionBar } from "../components/focus.js";

/* ───────── 标签页定义 ───────── */

const DETAIL_TABS = [
  { id: "overview", label: "总览" },
  { id: "compare", label: "个股对比" },
  { id: "notes", label: "持仓笔记" },
  { id: "signals", label: "信号与探索" },
] as const;

type DetailTabId = (typeof DETAIL_TABS)[number]["id"];

/* ───────── 表格列宽 ───────── */

const COL_WIDTHS = { code: 8, name: 18, price: 12, change: 12, tag: 10 } as const;
const TABLE_PADDING = 4;
const MIN_TABLE_WIDTH =
  COL_WIDTHS.code + COL_WIDTHS.name + COL_WIDTHS.price + COL_WIDTHS.change + COL_WIDTHS.tag + TABLE_PADDING;

function padRight(s: string, w: number): string {
  // 处理中文宽度：每个中文字符算 2 个英文宽度
  let vis = 0;
  for (let i = 0; i < s.length; i++) {
    vis += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s[i]) ? 2 : 1;
  }
  const spaces = Math.max(0, w - vis);
  return s + " ".repeat(spaces);
}

/* ───────── Props ───────── */

type Props = {
  isActive: boolean;
};

/* ───────── 组件 ───────── */

export function WatchlistPage({ isActive }: Props) {
  /* ---------- 数据状态 ---------- */
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [quotes, setQuotes] = useState<Map<string, WatchlistQuote>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* ---------- UI 状态 ---------- */
  const [selectedIdx, setSelectedIdx] = useState(0);        // 总览中选中的行
  const [detailMode, setDetailMode] = useState(false);       // 是否在个股详情
  const [detailTab, setDetailTab] = useState<DetailTabId>("overview");
  const [loadingLabel, setLoadingLabel] = useState("加载自选列表");

  /* ---------- 派生数据 ---------- */
  // 展平所有股票
  const flatStocks = useMemo(
    () => groups.flatMap(g => g.stocks),
    [groups],
  );

  const totalCount = flatStocks.length;
  const selectedStock = flatStocks[selectedIdx] ?? null;
  const selectedQuote = selectedStock
    ? quotes.get(selectedStock.lbSymbol) ?? undefined
    : undefined;

  /* ---------- 数据加载 ---------- */
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadingLabel("加载自选列表");
    try {
      const result = await loadWatchlistFull();
      setGroups(result.groups);
      setQuotes(result.quotes);
      if (result.error) setLoadError(result.error);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }, []);

  /** 刷新报价 */
  const refreshQuotes = useCallback(async () => {
    if (flatStocks.length === 0) return;
    setLoadingLabel("刷新报价");
    try {
      const { loadQuotes } = await import("../../services/watchlist.js");
      const lbSymbols = flatStocks.map(s => s.lbSymbol);
      const fresh = await loadQuotes(lbSymbols);
      setQuotes(fresh);
    } catch {
      // 静默失败
    } finally {
      setLoadingLabel("");
    }
  }, [flatStocks]);

  useEffect(() => {
    if (isActive) void loadData();
  }, [isActive, loadData]);

  /* ---------- 键盘输入 ---------- */
  useInput(
    (input, key) => {
      if (loading) return;

      /* 总览模式 */
      if (!detailMode) {
        if (key.upArrow || input === "k") {
          setSelectedIdx(i => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow || input === "j") {
          setSelectedIdx(i => Math.min(totalCount - 1, i + 1));
          return;
        }
        if (key.return) {
          if (selectedStock) {
            setDetailMode(true);
            setDetailTab("overview");
          }
          return;
        }
        if (input === "r") {
          void loadData();
          return;
        }
        return;
      }

      /* 详情模式 */
      if (detailMode) {
        if (key.escape) {
          setDetailMode(false);
          return;
        }
        if (key.leftArrow || input === "h") {
          const idx = DETAIL_TABS.findIndex(t => t.id === detailTab);
          setDetailTab(DETAIL_TABS[Math.max(0, idx - 1)]?.id ?? "overview");
          return;
        }
        if (key.rightArrow || input === "l" || key.tab) {
          const idx = DETAIL_TABS.findIndex(t => t.id === detailTab);
          const next = Math.min(DETAIL_TABS.length - 1, idx + 1);
          setDetailTab(DETAIL_TABS[next]?.id ?? detailTab);
          return;
        }
        return;
      }
    },
    { isActive },
  );

  /* ---------- 数据为空 ───────── */
  if (!loading && groups.length === 0 && !loadError) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan">Watchlist</Text>
        <Box marginTop={1}>
          <Text dimColor>
            自选列表为空。请先在长桥 APP 中添加自选股。
          </Text>
        </Box>
        <Text dimColor>按 [r] 重试加载</Text>
      </Box>
    );
  }

  /* ---------- 加载中 ───────── */
  const showSpinner = loading && loadingLabel;

  /* ---------- 个股详情视图 ───────── */
  if (detailMode && selectedStock) {
    return (
      <Box flexDirection="column" flexGrow={1} width="100%">
        {showSpinner ? (
          <Box>
            <Text bold color="cyan">Watchlist</Text>
            <SpinnerLine active label={loadingLabel} />
          </Box>
        ) : (
          <Text bold color="cyan">
            {selectedStock.symbol}
            <Text dimColor> — {selectedStock.name}</Text>
            {selectedStock.groupName ? (
              <Text dimColor> · {selectedStock.groupName}</Text>
            ) : null}
          </Text>
        )}

        {/* 标签页栏 */}
        <Box marginTop={1} flexDirection="row">
          {DETAIL_TABS.map((tab) => (
            <Text key={tab.id} dimColor={tab.id !== detailTab}>
              {tab.id === detailTab ? (
                <Text bold color="cyan">
                  [{tab.label}]
                </Text>
              ) : (
                ` ${tab.label} `
              )}
            </Text>
          ))}
        </Box>

        {/* 分隔线 */}
        <Text dimColor>{'─'.repeat(40)}</Text>

        {/* 标签页内容 */}
        <Box flexDirection="column" marginTop={1} flexGrow={1}>
          {detailTab === "overview" && (
            <StockOverview stock={selectedStock} quote={selectedQuote} />
          )}
          {detailTab === "compare" && (
            <StockCompare stock={selectedStock} />
          )}
          {detailTab === "notes" && (
            <StockNotes stock={selectedStock} />
          )}
          {detailTab === "signals" && (
            <StockSignals stock={selectedStock} />
          )}
        </Box>

        {/* 快捷键提示 */}
        <ActionBar>
          <Text dimColor>Esc 返回总览 · ←→ 切标签</Text>
        </ActionBar>
      </Box>
    );
  }

  /* ---------- 总览视图 ───────── */
  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box>
        <Text bold color="cyan">Watchlist</Text>
        {loading ? null : (
          <Text dimColor>
            {" "}· {totalCount} 只
            {groups.length > 1 && ` · ${groups.length} 组`}
          </Text>
        )}
      </Box>

      <AsyncLoading active={loading} label={loadingLabel} />
      {loadError && !loading ? <Text color="red">{loadError}</Text> : null}

      {/* 表格 */}
      {!loading && flatStocks.length > 0 ? (
        <Box flexDirection="column" marginTop={1} flexGrow={1}>
          {/* 表头 */}
          <Box>
            <Text bold color="yellow">
              {padRight("代码", COL_WIDTHS.code)}
              {padRight("名称", COL_WIDTHS.name)}
              {padRight("现价", COL_WIDTHS.price)}
              {padRight("涨跌", COL_WIDTHS.change)}
              {padRight("标签", COL_WIDTHS.tag)}
            </Text>
          </Box>
          <Text dimColor>
            {"─".repeat(
              COL_WIDTHS.code +
              COL_WIDTHS.name +
              COL_WIDTHS.price +
              COL_WIDTHS.change +
              COL_WIDTHS.tag,
            )}
          </Text>

          {/* 表体 */}
          {flatStocks.map((stock, i) => {
            const q = quotes.get(stock.lbSymbol);
            const isSelected = i === selectedIdx;
            const color = q?.color ?? "gray";

            return (
              <Box key={stock.lbSymbol}>
                <Text bold={isSelected} color={isSelected ? "cyan" : undefined}>
                  {padRight(stock.symbol, COL_WIDTHS.code)}
                  {padRight(stock.name, COL_WIDTHS.name)}
                  <Text color={color === "green" ? "green" : color === "red" ? "red" : undefined}>
                    {padRight(q?.price ?? "--", COL_WIDTHS.price)}
                    {padRight(q?.changePct ?? "--", COL_WIDTHS.change)}
                  </Text>
                  <Text dimColor>
                    {padRight(stock.tag || stock.groupName || "--", COL_WIDTHS.tag)}
                  </Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {/* 快捷键提示 */}
      <ActionBar>
        <Text dimColor>
          {totalCount > 0
            ? `按 Enter 查看个股详情 · ↑↓ 切换 · [r] 刷新 · 第 ${selectedIdx + 1}/${totalCount} 行`
            : "按 [r] 加载自选列表"}
        </Text>
      </ActionBar>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════
   标签页子视图
   ═══════════════════════════════════════════════════════════ */

function StockOverview({
  stock,
  quote,
}: {
  stock: WatchlistStock;
  quote?: WatchlistQuote;
}) {
  const lines: string[][] = [];

  if (quote) {
    lines.push(["现价", quote.price]);
    lines.push(["涨跌", `${quote.change} (${quote.changePct})`]);
    lines.push(["最高", quote.high]);
    lines.push(["最低", quote.low]);
    lines.push(["成交量", quote.volume]);
  } else {
    lines.push(["行情", "暂无数据"]);
  }

  lines.push(["市场", stock.market]);
  if (stock.groupName) lines.push(["分组", stock.groupName]);
  if (stock.tag) lines.push(["标签", stock.tag]);

  const labelW = Math.max(...lines.map(l => l[0].length)) + 2;

  return (
    <Box flexDirection="column">
      {lines.map(([label, value]) => (
        <Text key={label}>
          <Text bold>{label.padEnd(labelW)}</Text>
          <Text>{value}</Text>
        </Text>
      ))}
    </Box>
  );
}

function StockCompare({ stock }: { stock: WatchlistStock }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>同行对比数据由长桥「行业对标」提供。</Text>
      <Box marginTop={1}>
        <Text dimColor>
          当前标的: {stock.symbol} ({stock.market})
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>执行 longbridge industry-peers {stock.lbSymbol} 可获取同行列表。</Text>
      </Box>
    </Box>
  );
}

function StockNotes({ stock }: { stock: WatchlistStock }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>持仓笔记功能尚未接入持久化存储。</Text>
      <Box marginTop={1}>
        <Text dimColor>
          当前标的: {stock.symbol}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">
          计划: 连接 trader-agent 的 trade_notes 表存储和编辑笔记。
        </Text>
      </Box>
    </Box>
  );
}

function StockSignals({ stock }: { stock: WatchlistStock }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>信号与探索数据由市场数据管道提供。</Text>
      <Box marginTop={1}>
        <Text dimColor>
          当前标的: {stock.symbol}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">
          计划: 查询最近信号 (scan) 和当前活跃假设 (hypotheses)。
        </Text>
      </Box>
    </Box>
  );
}
