import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import { fetchHealth } from "../../api/client.js";
import { logger } from "../../log/logger.js";
import { hasLocalBars, ingestSymbol } from "../../services/market.js";
import { buildChartLines } from "../../services/chart.js";
import { CHART_INTERVALS, type ChartIntervalId } from "../../services/chartIntervals.js";
import {
  launchLongbridgeExternal,
  type LongbridgeLaunchMode,
} from "../../services/longbridge.js";
import { runTraderChartProcess } from "../../services/traderChart.js";
import { getInkInstance, relaunchTuiAfterChart } from "../chartSession.js";
import { runReport } from "../../services/report.js";
import { runScan } from "../../services/scan.js";
import type { ScanResult } from "../../services/types.js";
import { PREFERRED_SYMBOLS } from "../../symbols.js";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { ActionBar, KeyHint } from "../components/focus.js";
import { ScanSummary } from "../components/ScanSummary.js";
import { SymbolPicker, SymbolStrip } from "../components/SymbolPicker.js";
import { useCachedFetch } from "../hooks/useCachedFetch.js";
import { filterSymbolChoices, normalizeTicker } from "../symbolSearch.js";
import type { SignalRow } from "../types.js";

type Props = {
  isActive?: boolean;
  onStatus: (health: string, signalCount: number, hint?: string) => void;
  lastScan: ScanResult | null;
  setLastScan: React.Dispatch<React.SetStateAction<ScanResult | null>>;
  focusedSymbol: string;
  setFocusedSymbol: React.Dispatch<React.SetStateAction<string>>;
  chartInterval: ChartIntervalId;
  setChartInterval: React.Dispatch<React.SetStateAction<ChartIntervalId>>;
};

type SignalsResponse = { signals?: SignalRow[] };

function formatIngestLine(
  sym: string,
  daily: number,
  minute: number,
  force: boolean,
): string {
  if (daily === 0 && minute === 0) {
    return force
      ? `${sym} 无新增 K 线（可能源无数据或已最新）`
      : `${sym} 无新增（TTL 内已有缓存）`;
  }
  return `${sym} 行情已更新 · 日线 +${daily} · 5m +${minute}${force ? " (强制)" : ""}`;
}

function chartCacheKey(sym: string, interval: ChartIntervalId): string {
  return `${sym}:${interval}`;
}

export function DashboardPage({
  isActive = true,
  onStatus,
  lastScan,
  setLastScan,
  focusedSymbol,
  setFocusedSymbol,
  chartInterval,
  setChartInterval,
}: Props) {
  const { columns, rows } = useWindowSize();
  const {
    data,
    error,
    loading: signalsLoading,
    loadingLabel: signalsLoadingLabel,
    reload: reloadSignals,
  } = useCachedFetch<SignalsResponse>("/signals?limit=8", isActive, "加载信号列表");
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestHint, setIngestHint] = useState("");
  const [chartLines, setChartLines] = useState<string[]>([]);
  const [reportPreview, setReportPreview] = useState("");
  const [reportHit, setReportHit] = useState(false);
  const [reportScroll, setReportScroll] = useState(0);
  const [reportFocus, setReportFocus] = useState(false);
  const [symbolMode, setSymbolMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stripIndex, setStripIndex] = useState(() =>
    Math.max(
      0,
      PREFERRED_SYMBOLS.indexOf(focusedSymbol as (typeof PREFERRED_SYMBOLS)[number]),
    ),
  );
  const [healthOnce, setHealthOnce] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [longbridgeBusy, setLongbridgeBusy] = useState(false);
  const chartCacheRef = useRef(new Map<string, string[]>());
  const lastLoadedRef = useRef<string | null>(null);

  const stripChoices = useMemo(() => filterSymbolChoices(""), []);
  const chartWidth = Math.max(56, columns - 4);
  const signalSnippet = Math.max(32, columns - 16);
  const reportLines = useMemo(() => reportPreview.split("\n"), [reportPreview]);
  const reportViewport = Math.max(6, Math.floor(rows * 0.22));
  const reportMaxScroll = Math.max(0, reportLines.length - reportViewport);

  useEffect(() => {
    const idx = stripChoices.indexOf(focusedSymbol);
    if (idx >= 0) setStripIndex(idx);
  }, [focusedSymbol, stripChoices]);

  useEffect(() => {
    setReportScroll((s) => Math.min(s, reportMaxScroll));
  }, [reportMaxScroll]);

  const loadChart = useCallback(
    async (sym: string, interval: ChartIntervalId, force = false) => {
      const normalized = normalizeTicker(sym);
      if (!normalized) return false;
      const key = chartCacheKey(normalized, interval);
      if (!force && chartCacheRef.current.has(key)) {
        setChartLines(chartCacheRef.current.get(key)!);
        return !chartCacheRef.current.get(key)![0]?.includes("无");
      }
      setPendingLabel((prev) => prev ?? "加载 K 线");
      try {
        const lines = await buildChartLines(normalized, {
          chartInterval: interval,
          width: chartWidth,
          height: 14,
        });
        chartCacheRef.current.set(key, lines);
        setChartLines(lines);
        return !lines[0]?.includes("无");
      } catch (e: unknown) {
        const err = [e instanceof Error ? e.message : String(e)];
        chartCacheRef.current.set(key, err);
        setChartLines(err);
        return false;
      } finally {
        setPendingLabel((prev) => (prev === "加载 K 线" ? null : prev));
      }
    },
    [chartWidth],
  );

  const refreshMarket = useCallback(
    async (sym: string, force: boolean) => {
      const normalized = normalizeTicker(sym);
      if (!normalized) return;
      setIngestBusy(true);
      setIngestHint("");
      try {
        const res = await ingestSymbol(normalized, { force });
        setIngestHint(formatIngestLine(res.symbol, res.daily, res.minute, force));
        for (const k of [...chartCacheRef.current.keys()]) {
          if (k.startsWith(`${normalized}:`)) chartCacheRef.current.delete(k);
        }
        await loadChart(normalized, chartInterval, true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setIngestHint(`行情拉取失败: ${msg}`);
      } finally {
        setIngestBusy(false);
      }
    },
    [loadChart, chartInterval],
  );

  const selectSymbol = useCallback(
    async (sym: string) => {
      const normalized = normalizeTicker(sym);
      if (!normalized) return;
      lastLoadedRef.current = `${normalized}:${chartInterval}`;
      setFocusedSymbol(normalized);
      setReportPreview("");
      setReportScroll(0);
      setReportFocus(false);
      setPendingLabel("切换标的");
      try {
        const hasChart = await loadChart(normalized, chartInterval);
        if (hasChart) {
          setIngestHint(`${normalized} 本地缓存 · [f] 刷新 · [x] 换标的`);
          return;
        }
        setPendingLabel("检查本地行情");
        const hasBars = await hasLocalBars(normalized);
        if (hasBars) {
          setIngestHint(`${normalized} 有日线 · [f] 拉行情`);
          return;
        }
        setIngestHint(`${normalized} 无本地数据 · 自动拉取…`);
        await refreshMarket(normalized, false);
      } finally {
        setPendingLabel(null);
      }
    },
    [setFocusedSymbol, loadChart, refreshMarket, chartInterval],
  );

  const applySymbol = useCallback(
    (sym: string) => {
      void selectSymbol(sym);
      setSymbolMode(false);
    },
    [selectSymbol],
  );

  const cycleInterval = useCallback(
    (delta: number) => {
      const idx = CHART_INTERVALS.findIndex((x) => x.id === chartInterval);
      const next = CHART_INTERVALS[(idx + delta + CHART_INTERVALS.length) % CHART_INTERVALS.length];
      if (!next) return;
      setChartInterval(next.id);
      void loadChart(focusedSymbol, next.id, true);
    },
    [chartInterval, focusedSymbol, loadChart],
  );

  useEffect(() => {
    if (!isActive || pickerOpen) return;
    const token = `${focusedSymbol}:${chartInterval}`;
    if (lastLoadedRef.current === token) return;
    lastLoadedRef.current = token;
    void loadChart(focusedSymbol, chartInterval);
  }, [isActive, pickerOpen, focusedSymbol, chartInterval, loadChart]);

  const doScan = useCallback(async () => {
    setPendingLabel("信号 scan");
    try {
      const result = await runScan();
      setLastScan(result);
      setReportPreview("");
      setReportFocus(false);
    } catch (e: unknown) {
      setReportPreview(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingLabel(null);
    }
  }, [setLastScan]);

  const doReport = useCallback(async () => {
    setPendingLabel("日报生成");
    setReportPreview("");
    setReportScroll(0);
    setReportFocus(true);
    setSymbolMode(false);
    try {
      const result = await runReport(focusedSymbol);
      setReportHit(result.hit);
      setReportPreview(result.text);
    } catch (e: unknown) {
      setReportHit(false);
      setReportPreview(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingLabel(null);
    }
  }, [focusedSymbol]);

  const openRatatuiChart = useCallback(() => {
    getInkInstance()?.unmount();
    const res = runTraderChartProcess({ symbol: focusedSymbol, chartInterval });
    if (!res.ok) {
      logger.error({ message: res.message }, "trader chart launch failed");
      void relaunchTuiAfterChart({ focusedSymbol, chartInterval });
      return;
    }
    void relaunchTuiAfterChart({
      focusedSymbol: res.restored.symbol,
      chartInterval: res.restored.chartInterval,
    });
  }, [focusedSymbol, chartInterval]);

  const doLongbridge = useCallback(
    async (mode: LongbridgeLaunchMode) => {
      setLongbridgeBusy(true);
      setIngestHint("");
      try {
        const res = await launchLongbridgeExternal(mode, focusedSymbol);
        setIngestHint(res.ok ? res.message : `Longbridge: ${res.message}`);
      } catch (e: unknown) {
        setIngestHint(
          `Longbridge 启动失败: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setLongbridgeBusy(false);
      }
    },
    [focusedSymbol],
  );

  useEffect(() => {
    if (!isActive || healthOnce) return;
    let cancelled = false;
    setHealthLoading(true);
    (async () => {
      try {
        const h = await fetchHealth();
        if (cancelled) return;
        setHealthOnce(true);
        const list = data?.signals ?? [];
        onStatus(
          h.status === "ok" ? "ok" : String(h.status),
          list.length,
          `${focusedSymbol} · ${chartInterval}`,
        );
      } catch {
        if (cancelled) return;
        onStatus("offline", 0, "Ops [S] 启动后端");
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setHealthLoading(false);
    };
  }, [isActive, healthOnce, data, onStatus, focusedSymbol, chartInterval]);

  useInput(
    (input, key) => {
      if (
        pendingLabel ||
        pickerOpen ||
        ingestBusy ||
        signalsLoading ||
        longbridgeBusy
      ) {
        return;
      }
      const ch = input.toLowerCase();

      if (!symbolMode && ch === "c") {
        openRatatuiChart();
        return;
      }
      if (!symbolMode && input === "L") {
        void doLongbridge("kline");
        return;
      }
      if (!symbolMode && ch === "l") {
        void doLongbridge("tui");
        return;
      }

      if (ch === "x") {
        setSymbolMode((m) => !m);
        return;
      }

      if (key.escape) {
        if (symbolMode) {
          setSymbolMode(false);
          return;
        }
        if (reportFocus) {
          setReportFocus(false);
          return;
        }
        return;
      }

      if (symbolMode) {
        if (key.leftArrow || ch === "h") {
          const next = Math.max(0, stripIndex - 1);
          setStripIndex(next);
          const sym = stripChoices[next];
          if (sym) void selectSymbol(sym);
          return;
        }
        if (key.rightArrow || ch === "l") {
          const next = Math.min(stripChoices.length - 1, stripIndex + 1);
          setStripIndex(next);
          const sym = stripChoices[next];
          if (sym) void selectSymbol(sym);
        }
        return;
      }

      if (reportPreview && (key.upArrow || key.downArrow)) {
        setReportFocus(true);
        if (key.upArrow) {
          setReportScroll((s) => Math.max(0, s - 1));
        } else {
          setReportScroll((s) => Math.min(reportMaxScroll, s + 1));
        }
        return;
      }

      if (input === "[" || ch === ",") {
        cycleInterval(-1);
        return;
      }
      if (input === "]" || ch === ".") {
        cycleInterval(1);
        return;
      }

      if (ch === "r") {
        void reloadSignals(true);
        return;
      }
      if (ch === "f") {
        void refreshMarket(focusedSymbol, true);
        return;
      }
      if (ch === "s") {
        void doScan();
        return;
      }
      if (ch === "g") {
        void doReport();
        return;
      }
      if (input === "/" || ch === "o") {
        setPickerOpen(true);
        return;
      }
    },
    { isActive },
  );

  const signals = data?.signals ?? [];
  const reportLoading = pendingLabel === "日报生成";
  const showChart =
    chartLines.length > 0 && pendingLabel !== "加载 K 线" && pendingLabel !== "切换标的";
  const visibleReport = reportLines.slice(reportScroll, reportScroll + reportViewport);
  const intervalLabel =
    CHART_INTERVALS.find((x) => x.id === chartInterval)?.label ?? chartInterval;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Text bold color="cyan">
        Dashboard
      </Text>
      <AsyncLoading active={healthLoading} label="检查后端" />
      {pickerOpen ? (
        <SymbolPicker
          isActive={isActive}
          value={focusedSymbol}
          onChange={applySymbol}
          onClose={() => setPickerOpen(false)}
        />
      ) : (
        <SymbolStrip focusedSymbol={focusedSymbol} symbolMode={symbolMode} />
      )}
      <AsyncLoading
        active={ingestBusy || longbridgeBusy}
        label={longbridgeBusy ? "检查 Longbridge" : `拉取 ${focusedSymbol} 行情`}
        hint={ingestHint || undefined}
      />
      {!ingestBusy && !longbridgeBusy && ingestHint ? (
        <Text dimColor wrap="truncate">
          {ingestHint}
        </Text>
      ) : null}
      <AsyncLoading active={Boolean(pendingLabel && pendingLabel !== "日报生成")} label={pendingLabel ?? ""} />
      <ActionBar>
        <KeyHint keys="x" label={symbolMode ? "退出换标的" : "换标的"} />
        <KeyHint keys="[]" label="周期" />
        <KeyHint keys="f" label="拉行情" />
        <KeyHint keys="g" label="日报" />
        <KeyHint keys="s" label="scan" dim />
        <KeyHint keys="c" label="K线全屏" />
        <KeyHint keys="l" label="长桥 TUI" />
        <KeyHint keys="L" label="长桥 K线" dim />
      </ActionBar>
      <ScanSummary scan={lastScan} />

      <Box flexDirection="column" flexGrow={1} width="100%" marginTop={1} minHeight={8}>
        <Text bold color="cyan">
          K 线 · {intervalLabel}
          {symbolMode ? (
            <Text color="yellow"> · [x] 标的模式 ←→</Text>
          ) : (
            <Text dimColor> · [/] 搜索</Text>
          )}
        </Text>
        <Text dimColor italic>
          {CHART_INTERVALS.map((x) => (
            <Text
              key={x.id}
              color={x.id === chartInterval ? "yellow" : undefined}
              bold={x.id === chartInterval}
            >
              {x.id === chartInterval ? ` ${x.label} ` : ` ${x.label} `}
            </Text>
          ))}
        </Text>
        {showChart ? (
          <Box flexDirection="column" marginTop={1}>
            {chartLines.map((line, i) => (
              <Text key={i} dimColor>
                {line}
              </Text>
            ))}
          </Box>
        ) : (
          <Text dimColor>无图表 · [f] 拉行情 · [] 切换周期</Text>
        )}
        <AsyncLoading
          active={reportLoading}
          label="日报生成"
          hint={`标的 ${focusedSymbol}`}
        />
        {!reportLoading && reportPreview ? (
          <Box
            marginTop={1}
            flexDirection="column"
            borderStyle={reportFocus ? "single" : undefined}
            borderColor="cyan"
            paddingX={reportFocus ? 1 : 0}
          >
            <Text color={reportHit ? "green" : undefined}>
              {reportHit ? "[缓存] " : ""}Report · {focusedSymbol}
              <Text dimColor>
                {" "}
                · ↑↓ 滚动 {reportScroll + 1}-
                {Math.min(reportScroll + reportViewport, reportLines.length)}/
                {reportLines.length}
                {reportFocus ? "" : " (按↑↓进入)"}
              </Text>
            </Text>
            {visibleReport.map((line, i) => (
              <Text key={`${reportScroll}-${i}`} wrap="wrap">
                {line || " "}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>

      <Box
        flexDirection="column"
        width="100%"
        flexShrink={0}
        marginTop={1}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <Text bold color="cyan">
          最近信号 ({signals.length})
          <Text dimColor> · [r] 刷新 · [s] scan</Text>
        </Text>
        <AsyncLoading active={signalsLoading} label={signalsLoadingLabel} />
        {!signalsLoading && error ? <Text color="red">{error}</Text> : null}
        {!signalsLoading && !error && signals.length === 0 ? (
          <Text dimColor>暂无</Text>
        ) : null}
        {!signalsLoading
          ? signals.slice(0, 5).map((s) => (
              <Text key={s.signal_id ?? `${s.symbol}-${s.ts}`} wrap="truncate">
                <Text color="yellow">{s.symbol ?? "?"}</Text>
                <Text dimColor> · {s.signal_type ?? "—"} · {s.status ?? "—"}</Text>
                <Text dimColor> · {(s.raw_description ?? "").slice(0, signalSnippet)}</Text>
              </Text>
            ))
          : null}
      </Box>
    </Box>
  );
}
