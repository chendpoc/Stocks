import type { MarketDayType } from "./wakeSchedule.js";

export interface DaemonStatus {
  running: boolean;
  lastWake: Date | null;
  runCount: number;
  lastGateDecision: string | null;
  lastError: string | null;
}

export interface GateResult {
  run: boolean;
  complexity_score: number;
  recommended_agent: string | null;
  recommended_pattern: string | null;
  symbols: string[];
  reasoning: string;
}

export interface RunLogEntry {
  timestamp: string;
  dayType: MarketDayType;
  gate: GateResult | null;
  error: string | null;
  elapsedMs: number;
}

export const HEARTBEAT_LOG_LIMIT = 50;
