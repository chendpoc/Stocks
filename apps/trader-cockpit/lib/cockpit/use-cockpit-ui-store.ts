"use client";

import { create } from "zustand";

export type CockpitDensity = "compact" | "comfortable";
export type ConnectionState = "live" | "reconnecting" | "offline";

type CockpitUiState = {
  navCollapsed: boolean;
  selectedSymbol: string;
  selectedSignalId: string | null;
  selectedTheoryId: string | null;
  timelineMode: "simple" | "detailed" | "developer";
  density: CockpitDensity;
  chartTimeframe: "5m" | "15m" | "1h";
  connectionState: ConnectionState;
  setNavCollapsed: (navCollapsed: boolean) => void;
  setSelectedSymbol: (selectedSymbol: string) => void;
  setSelectedSignalId: (selectedSignalId: string | null) => void;
  setSelectedTheoryId: (selectedTheoryId: string | null) => void;
  setTimelineMode: (timelineMode: CockpitUiState["timelineMode"]) => void;
  setDensity: (density: CockpitDensity) => void;
  setChartTimeframe: (chartTimeframe: CockpitUiState["chartTimeframe"]) => void;
  setConnectionState: (connectionState: ConnectionState) => void;
};

export const useCockpitUiStore = create<CockpitUiState>((set) => ({
  navCollapsed: false,
  selectedSymbol: "TSLA",
  selectedSignalId: null,
  selectedTheoryId: null,
  timelineMode: "detailed",
  density: "compact",
  chartTimeframe: "5m",
  connectionState: "live",
  setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
  setSelectedSignalId: (selectedSignalId) => set({ selectedSignalId }),
  setSelectedTheoryId: (selectedTheoryId) => set({ selectedTheoryId }),
  setTimelineMode: (timelineMode) => set({ timelineMode }),
  setDensity: (density) => set({ density }),
  setChartTimeframe: (chartTimeframe) => set({ chartTimeframe }),
  setConnectionState: (connectionState) => set({ connectionState }),
}));
