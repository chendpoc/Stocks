import React from "react";
import { render, type Instance } from "ink";
import { user } from "../log/index.js";
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
  /** 兼容 chart restore 路径：true 时直达内容区。优先级高于 startInMenu。 */
  startInContent?: boolean;
  focusedSymbol?: string;
  chartInterval?: ChartIntervalId;
};

export async function launchTui(options: LaunchTuiOptions = {}): Promise<Instance> {
  const {
    initialMenu = "dashboard",
    startInMenu = true,
    startInContent,
    focusedSymbol = PREFERRED_SYMBOLS[0] ?? "TSLA",
    chartInterval = "30d",
  } = options;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    user.die("TUI 需要交互式终端（请使用 Windows Terminal / PowerShell，而非管道模式）。");
  }

  const { getLongbridgeStartupHint } = await import("../services/longbridgeAgent.js");
  const startupHint = await getLongbridgeStartupHint();

  const instance = render(
    React.createElement(App, {
      initialMenu,
      startInContent: startInContent ?? !startInMenu,
      focusedSymbol: focusedSymbol.toUpperCase(),
      chartInterval: normalizeChartInterval(chartInterval),
      startupHint: startupHint ?? undefined,
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
