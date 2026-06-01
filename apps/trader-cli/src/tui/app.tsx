import React, { useCallback, useState } from "react";
import { Box, useApp, useInput, useWindowSize } from "ink";
import { Sidebar } from "./components/Sidebar.js";
import { ContentArea } from "./components/ContentArea.js";
import { StatusBar } from "./components/StatusBar.js";
import { HotkeyBar } from "./components/HotkeyBar.js";
import { ContextHint } from "./components/ContextHint.js";
import { MENU_ITEMS, MENU_KEYS, menuIndex, type MenuId, type ViewMode } from "./menu.js";
import {
  normalizeChartInterval,
  type ChartIntervalId,
} from "../services/chartIntervals.js";
import { PREFERRED_SYMBOLS } from "../symbols.js";
import type { ScanResult } from "../services/types.js";
import type { ChatMessage } from "./types.js";

type AppProps = {
  initialMenu?: MenuId;
  /** 启动时是否直接进入内容区（默认 true，与原先 dashboard 直达一致） */
  startInContent?: boolean;
  focusedSymbol?: string;
  chartInterval?: ChartIntervalId;
};

export function App({
  initialMenu = "dashboard",
  startInContent = true,
  focusedSymbol: initialSymbol = PREFERRED_SYMBOLS[0] ?? "TSLA",
  chartInterval: initialChartInterval = "30d",
}: AppProps) {
  const { exit } = useApp();
  const { rows } = useWindowSize();
  const [viewMode, setViewMode] = useState<ViewMode>(startInContent ? "content" : "menu");
  const [active, setActive] = useState<MenuId>(initialMenu);
  const [focusIndex, setFocusIndex] = useState(() => menuIndex(initialMenu));
  const [prevMenuFocus, setPrevMenuFocus] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [health, setHealth] = useState("…");
  const [signalCount, setSignalCount] = useState(0);
  const [backendHint, setBackendHint] = useState<string | undefined>();
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [focusedSymbol, setFocusedSymbol] = useState(initialSymbol);
  const [chartInterval, setChartInterval] = useState<ChartIntervalId>(
    normalizeChartInterval(initialChartInterval),
  );

  const onStatus = useCallback((h: string, count: number, hint?: string) => {
    setHealth(h);
    setSignalCount(count);
    setBackendHint(hint);
  }, []);

  const openMenu = useCallback(() => {
    setViewMode("menu");
    setFocusIndex(menuIndex(active));
  }, [active]);

  const enterContent = useCallback((id: MenuId) => {
    setActive(id);
    setFocusIndex((prev) => {
      setPrevMenuFocus(prev);
      return menuIndex(id);
    });
    setViewMode("content");
  }, []);

  const moveMenuFocus = useCallback((next: number) => {
    setFocusIndex((prev) => {
      setPrevMenuFocus(prev);
      return next;
    });
  }, []);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    if (viewMode === "menu") {
      if (key.ctrl && MENU_KEYS[input]) {
        enterContent(MENU_KEYS[input]);
        return;
      }
      if (key.upArrow) {
        moveMenuFocus(Math.max(0, focusIndex - 1));
        return;
      }
      if (key.downArrow) {
        moveMenuFocus(Math.min(MENU_ITEMS.length - 1, focusIndex + 1));
        return;
      }
      if (key.return || input === " ") {
        const target = MENU_ITEMS[focusIndex];
        if (target) enterContent(target.id);
        return;
      }
      if (!key.ctrl && MENU_KEYS[input]) {
        enterContent(MENU_KEYS[input]);
      }
      return;
    }

    // --- 内容区全屏 ---
    if (input === "m") {
      openMenu();
      return;
    }

    if (key.escape) {
      if (active === "hypotheses" || active === "lessons" || active === "signals" || active === "chat") {
        return;
      }
      openMenu();
      return;
    }

    if (key.ctrl && MENU_KEYS[input]) {
      enterContent(MENU_KEYS[input]);
      return;
    }

    if (!key.ctrl && MENU_KEYS[input]) {
      enterContent(MENU_KEYS[input]);
    }
  });

  const height = Math.max(rows, 20);
  const inMenu = viewMode === "menu";

  return (
    <Box flexDirection="column" height={height} width="100%">
      <StatusBar health={health} signalCount={signalCount} backendHint={backendHint} />
      {!inMenu ? <ContextHint active={active} /> : null}
      <Box flexGrow={1} minHeight={Math.max(rows - 6, 10)} width="100%">
        {inMenu ? (
          <Sidebar
            active={active}
            focusIndex={focusIndex}
            prevFocusIndex={prevMenuFocus}
            fullScreen
          />
        ) : (
          <ContentArea
            active={active}
            onNavigate={enterContent}
            onOpenMenu={openMenu}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            onStatus={onStatus}
            lastScan={lastScan}
            setLastScan={setLastScan}
            focusedSymbol={focusedSymbol}
            setFocusedSymbol={setFocusedSymbol}
            chartInterval={chartInterval}
            setChartInterval={setChartInterval}
          />
        )}
      </Box>
      <HotkeyBar viewMode={viewMode} onChat={active === "chat"} activeMenu={active} />
    </Box>
  );
}
