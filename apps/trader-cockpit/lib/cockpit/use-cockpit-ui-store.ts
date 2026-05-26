"use client";

import { create } from "zustand";

export type CockpitDensity = "compact" | "comfortable";
export type CockpitLanguage = "zh-CN" | "en-US";
export type ChatDockMode = "collapsed" | "dock" | "expanded";
export type ConnectionState = "live" | "reconnecting" | "offline";

const LANGUAGE_STORAGE_KEY = "trader-cockpit.language";

function readStoredLanguage(): CockpitLanguage {
  if (typeof window === "undefined") {
    return "zh-CN";
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === "en-US" || stored === "zh-CN" ? stored : "zh-CN";
}

function storeLanguage(language: CockpitLanguage) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
}

type CockpitUiState = {
  navCollapsed: boolean;
  selectedSymbol: string;
  selectedSignalId: string | null;
  selectedTheoryId: string | null;
  chatDockMode: ChatDockMode;
  timelineMode: "simple" | "detailed" | "developer";
  density: CockpitDensity;
  language: CockpitLanguage;
  chartTimeframe: "5m" | "15m" | "1h";
  connectionState: ConnectionState;
  setNavCollapsed: (navCollapsed: boolean) => void;
  setSelectedSymbol: (selectedSymbol: string) => void;
  setSelectedSignalId: (selectedSignalId: string | null) => void;
  setSelectedTheoryId: (selectedTheoryId: string | null) => void;
  setChatDockMode: (chatDockMode: ChatDockMode) => void;
  setTimelineMode: (timelineMode: CockpitUiState["timelineMode"]) => void;
  setDensity: (density: CockpitDensity) => void;
  setLanguage: (language: CockpitLanguage) => void;
  setChartTimeframe: (chartTimeframe: CockpitUiState["chartTimeframe"]) => void;
  setConnectionState: (connectionState: ConnectionState) => void;
};

export const useCockpitUiStore = create<CockpitUiState>((set) => ({
  navCollapsed: false,
  selectedSymbol: "TSLA",
  selectedSignalId: null,
  selectedTheoryId: null,
  chatDockMode: "collapsed",
  timelineMode: "detailed",
  density: "compact",
  language: readStoredLanguage(),
  chartTimeframe: "5m",
  connectionState: "live",
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setSelectedSignalId: (selectedSignalId) => set({ selectedSignalId }),
  setSelectedTheoryId: (selectedTheoryId) => set({ selectedTheoryId }),
  setChatDockMode: (chatDockMode) => set({ chatDockMode }),
  setTimelineMode: (timelineMode) => set({ timelineMode }),
  setDensity: (density) => set({ density }),
  setLanguage: (language) => {
    storeLanguage(language);
    set({ language });
  },
  setChartTimeframe: (chartTimeframe) => set({ chartTimeframe }),
  setConnectionState: (connectionState) => set({ connectionState }),
}));
