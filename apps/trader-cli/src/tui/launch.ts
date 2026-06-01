import React from "react";
import { render, type Instance } from "ink";
import type { ChartIntervalId } from "../services/chartIntervals.js";
import { normalizeChartInterval } from "../services/chartIntervals.js";
import { PREFERRED_SYMBOLS } from "../symbols.js";
import { App } from "./app.js";
import { setInkInstance } from "./chartSession.js";
import type { MenuId } from "./menu.js";

export type LaunchTuiOptions = {
  /** 进入内容区时的默认页 */
  initialMenu?: MenuId;
  /** true：启动先显示全屏菜单；false：直达内容区 */
  startInMenu?: boolean;
  focusedSymbol?: string;
  chartInterval?: ChartIntervalId;
};

export function launchTui(options: LaunchTuiOptions = {}): Instance {
  const {
    initialMenu = "dashboard",
    startInMenu = true,
    focusedSymbol = PREFERRED_SYMBOLS[0] ?? "TSLA",
    chartInterval = "30d",
  } = options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("TUI 需要交互式终端（请使用 Windows Terminal / PowerShell，而非管道模式）。");
    process.exit(1);
  }

  const instance = render(
    React.createElement(App, {
      initialMenu,
      startInContent: !startInMenu,
      focusedSymbol: focusedSymbol.toUpperCase(),
      chartInterval: normalizeChartInterval(chartInterval),
    }),
    {
      alternateScreen: true,
      exitOnCtrlC: true,
      patchConsole: true,
    },
  );
  setInkInstance(instance);
  return instance;
}
