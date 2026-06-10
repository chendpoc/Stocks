import type { Instance } from "ink";
import type { ChartIntervalId } from "../services/chartIntervals.js";
import { normalizeChartInterval } from "../services/chartIntervals.js";
import { readChartHandoff } from "../services/traderChart.js";
import type { MenuId } from "./menu.js";
import { launchTui, type LaunchTuiOptions } from "./launch.js";

let inkInstance: Instance | null = null;

export function setInkInstance(instance: Instance | null): void {
  inkInstance = instance;
}

export function getInkInstance(): Instance | null {
  return inkInstance;
}

export type ChartSessionRestore = {
  focusedSymbol: string;
  chartInterval: ChartIntervalId;
  initialMenu: MenuId;
};

export async function launchTuiWithChartRestore(base: LaunchTuiOptions = {}): Promise<Instance> {
  const handoff = readChartHandoff();
  const options: LaunchTuiOptions = {
    ...base,
    initialMenu: (handoff?.menu as MenuId | undefined) ?? base.initialMenu ?? "dashboard",
    startInContent: base.startInContent ?? true,
    focusedSymbol: handoff?.symbol?.toUpperCase() ?? base.focusedSymbol,
    chartInterval: handoff?.chart
      ? normalizeChartInterval(handoff.chart)
      : base.chartInterval,
  };
  return launchTui(options);
}

export async function relaunchTuiAfterChart(base: LaunchTuiOptions = {}): Promise<Instance> {
  return launchTuiWithChartRestore({ ...base, startInContent: true, initialMenu: "dashboard" });
}
