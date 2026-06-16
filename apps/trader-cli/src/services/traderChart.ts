import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChartIntervalId } from "./chartIntervals.js";
import { normalizeChartInterval } from "./chartIntervals.js";
import { config } from "../config.js";
import { findRepoRoot } from "./repoRoot.js";
import { normalizeSymbol } from "../utils/symbol.js";

export type ChartHandoff = {
  symbol: string;
  chart: string;
  menu?: string;
};

export type TraderChartLaunchState = {
  symbol: string;
  chartInterval: ChartIntervalId;
};

export type TraderChartRunResult =
  | { ok: true; restored: TraderChartLaunchState }
  | { ok: false; message: string };

export function chartHandoffPath(): string {
  const env =
    process.env.TRADER_CHART_HANDOFF?.trim() || config.traderChartHandoff.trim();
  if (env) return env;
  return join(findRepoRoot(), ".cache", "trader-cli", "chart-handoff.json");
}

export function readChartHandoff(): ChartHandoff | null {
  const path = chartHandoffPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as ChartHandoff;
    if (!data.symbol) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeChartHandoff(state: ChartHandoff): void {
  const path = chartHandoffPath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      { symbol: normalizeSymbol(state.symbol), chart: state.chart, menu: state.menu ?? "dashboard" },
      null,
      2,
    ),
    "utf8",
  );
}

export function resolveTraderChartBinary(): { path: string } | { error: string } {
  const envBin =
    process.env.TRADER_CHART_BIN?.trim() || config.traderChartBin.trim();
  if (envBin && existsSync(envBin)) {
    return { path: envBin };
  }
  const root = findRepoRoot();
  const names =
    process.platform === "win32"
      ? ["trader-chart.exe", "trader-chart"]
      : ["trader-chart"];
  for (const name of names) {
    const release = join(root, "target", "release", name);
    if (existsSync(release)) return { path: release };
    const debug = join(root, "target", "debug", name);
    if (existsSync(debug)) return { path: debug };
  }
  return {
    error:
      "未找到 trader-chart 二进制。请运行: npm run trader-chart:build（或设置 TRADER_CHART_BIN）",
  };
}

export function runTraderChartProcess(
  state: TraderChartLaunchState,
): TraderChartRunResult {
  const resolved = resolveTraderChartBinary();
  if ("error" in resolved) {
    return { ok: false, message: resolved.error };
  }

  writeChartHandoff({
    symbol: state.symbol,
    chart: state.chartInterval,
    menu: "dashboard",
  });

  const handoff = chartHandoffPath();
  const args = [
    "--symbol",
    state.symbol,
    "--chart",
    state.chartInterval,
    "--handoff",
    handoff,
  ];

  const result = spawnSync(resolved.path, args, {
    stdio: "inherit",
    env: process.env,
    windowsHide: false,
  });

  if (result.error) {
    return { ok: false, message: result.error.message };
  }
  if (result.status !== 0 && result.status !== null) {
    return { ok: false, message: `trader-chart 退出码 ${result.status}` };
  }

  const restored = readChartHandoff();
  if (!restored?.symbol) {
    return {
      ok: true,
      restored: { symbol: state.symbol, chartInterval: state.chartInterval },
    };
  }
  return {
    ok: true,
    restored: {
      symbol: normalizeSymbol(restored.symbol),
      chartInterval: normalizeChartInterval(restored.chart),
    },
  };
}
