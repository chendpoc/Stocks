import React from "react";
import { Box } from "ink";
import type { ChartIntervalId } from "../../services/chartIntervals.js";
import type { ScanResult } from "../../services/types.js";
import type { MenuId } from "../menu.js";
import type { ChatMessage } from "../types.js";
import { PagePanel } from "./PagePanel.js";
import { DashboardPage } from "../pages/DashboardPage.js";
import { WatchlistPage } from "../pages/WatchlistPage.js";
import { ChatPage } from "../pages/ChatPage.js";
import { SignalsPage } from "../pages/SignalsPage.js";
import { HypothesesPage } from "../pages/HypothesesPage.js";
import { LessonsPage } from "../pages/LessonsPage.js";
import { OpsPage } from "../pages/OpsPage.js";
import { SettingsPage } from "../pages/SettingsPage.js";

type Props = {
  active: MenuId;
  onNavigate: (id: MenuId) => void;
  onOpenMenu: () => void;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onStatus: (health: string, signalCount: number, hint?: string) => void;
  lastScan: ScanResult | null;
  setLastScan: React.Dispatch<React.SetStateAction<ScanResult | null>>;
  focusedSymbol: string;
  setFocusedSymbol: React.Dispatch<React.SetStateAction<string>>;
  chartInterval: ChartIntervalId;
  setChartInterval: React.Dispatch<React.SetStateAction<ChartIntervalId>>;
};

export function ContentArea({
  active,
  onNavigate,
  onOpenMenu,
  chatMessages,
  setChatMessages,
  onStatus,
  lastScan,
  setLastScan,
  focusedSymbol,
  setFocusedSymbol,
  chartInterval,
  setChartInterval,
}: Props) {
  return (
    <Box flexGrow={1} flexDirection="column" width="100%" paddingX={1}>
      <PagePanel id="dashboard" active={active}>
        <DashboardPage
          isActive={active === "dashboard"}
          onStatus={onStatus}
          lastScan={lastScan}
          setLastScan={setLastScan}
          focusedSymbol={focusedSymbol}
          setFocusedSymbol={setFocusedSymbol}
          chartInterval={chartInterval}
          setChartInterval={setChartInterval}
        />
      </PagePanel>
      <PagePanel id="watchlist" active={active}>
        <WatchlistPage isActive={active === "watchlist"} />
      </PagePanel>
      <PagePanel id="chat" active={active}>
        <ChatPage
          isActive={active === "chat"}
          onNavigate={onNavigate}
          onOpenMenu={onOpenMenu}
          messages={chatMessages}
          setMessages={setChatMessages}
        />
      </PagePanel>
      <PagePanel id="signals" active={active}>
        <SignalsPage
          isActive={active === "signals"}
          onOpenMenu={onOpenMenu}
          lastScan={lastScan}
          setLastScan={setLastScan}
        />
      </PagePanel>
      <PagePanel id="hypotheses" active={active}>
        <HypothesesPage isActive={active === "hypotheses"} onOpenMenu={onOpenMenu} />
      </PagePanel>
      <PagePanel id="lessons" active={active}>
        <LessonsPage isActive={active === "lessons"} onOpenMenu={onOpenMenu} />
      </PagePanel>
      <PagePanel id="ops" active={active}>
        <OpsPage isActive={active === "ops"} />
      </PagePanel>
      <PagePanel id="settings" active={active}>
        <SettingsPage isActive={active === "settings"} />
      </PagePanel>
    </Box>
  );
}
