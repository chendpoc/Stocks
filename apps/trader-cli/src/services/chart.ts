import asciichart from "asciichart";
import { fetchIntel } from "../api/client.js";
import type { ChartIntervalId } from "./chartIntervals.js";

export type ChartBar = { ts: string; close: number };

type BarsResponse = {
  bars?: Array<{ ts: string; close: number }>;
  timeframe?: string;
  chart?: string;
};

function formatAxisLabel(ts: string, interval: ChartIntervalId): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) {
    return ts.length > 10 ? ts.slice(5, 16) : ts;
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  if (interval === "30d") return `${mm}-${dd}`;
  if (interval === "1h" || interval === "2h" || interval === "4h") return `${mm}-${dd}`;
  return `${mm}-${dd} ${hh}:${mi}`;
}

/** 在 plot 宽度上均匀放置 x 轴刻度 */
function buildXAxisLine(labels: string[], plotWidth: number): string {
  if (labels.length === 0) return "";
  const width = Math.max(plotWidth, labels.length);
  const slots = Math.min(8, labels.length);
  const chars = Array(width).fill(" ");
  const used: number[] = [];

  for (let s = 0; s < slots; s++) {
    const idx =
      slots === 1 ? 0 : Math.round((s / (slots - 1)) * (labels.length - 1));
    const label = labels[idx] ?? "";
    const pos = Math.round((idx / Math.max(labels.length - 1, 1)) * (width - label.length));
    const start = Math.max(0, Math.min(pos, width - label.length));
    let clash = false;
    for (let i = start; i < start + label.length; i++) {
      if (chars[i] !== " ") clash = true;
    }
    if (clash) continue;
    for (let i = 0; i < label.length; i++) {
      chars[start + i] = label[i] ?? " ";
    }
    used.push(start);
  }

  return `${chars.join("")}`;
}

export async function buildChartLines(
  symbol: string,
  options: {
    chartInterval: ChartIntervalId;
    width: number;
    height?: number;
  },
): Promise<string[]> {
  const sym = symbol.toUpperCase();
  const height = options.height ?? 14;
  const limit = Math.min(160, Math.max(48, options.width - 6));
  const q = new URLSearchParams({
    symbol: sym,
    chart: options.chartInterval,
    limit: String(limit),
  });
  const payload = (await fetchIntel(`/market/bars?${q}`)) as BarsResponse;
  const list = payload.bars ?? [];
  const closes = list
    .map((b) => Number(b.close))
    .filter((n) => !Number.isNaN(n));
  if (closes.length === 0) {
    return [`无 ${sym} ${options.chartInterval} K 线 · 请先 [f] 拉行情`];
  }

  const labels = list.map((b) => formatAxisLabel(b.ts, options.chartInterval));
  const tf = payload.timeframe ?? options.chartInterval;
  const header = `${sym} · ${options.chartInterval} (源 ${tf}) · ${closes.length} 根`;
  const plot = asciichart.plot(closes, { height });
  const plotWidth = Math.max(...plot.split("\n").map((l) => l.length), closes.length);
  const xAxis = buildXAxisLine(labels, plotWidth);
  return [header, plot, xAxis ? `└ ${xAxis}` : ""].filter(Boolean);
}
