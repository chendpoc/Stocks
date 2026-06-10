/**
 * Market Agent Daemon
 *
 * Timed loop:
 * 1. init wake config + holiday cache
 * 2. skip analysis on weekends/holidays (heartbeat only)
 * 3. apply due dynamic wake tasks
 * 4. collect market summary
 * 5. run CoT gate
 * 6. route or schedule next wake task
 */

import { generateText } from "ai";
import { getModel } from "../llm/provider.js";
import { DAEMON_GATE_SYSTEM_PROMPT } from "../llm/prompts/daemonGate.js";
import { fetchIntel } from "../api/client.js";
import { executeAgent, spawn } from "./agentFactory.js";
import {
  initWakeConfig,
  initHolidayCache,
  getFixedWakeConfig,
  getMarketDayType,
  addDynamicTask,
  getActiveDynamicTasks,
  removeDynamicTask,
  type MarketDayType,
  type DynamicWakeTask,
} from "./wakeSchedule.js";

export interface DaemonStatus {
  running: boolean;
  lastWake: Date | null;
  runCount: number;
  lastGateDecision: string | null;
  lastError: string | null;
}

interface GateResult {
  run: boolean;
  complexity_score: number;
  recommended_agent: string | null;
  recommended_pattern: string | null;
  symbols: string[];
  reasoning: string;
}

interface RunLogEntry {
  timestamp: string;
  dayType: MarketDayType;
  gate: GateResult | null;
  error: string | null;
  elapsedMs: number;
}

const HEARTBEAT_LOG_LIMIT = 50;

export class MarketAgentDaemon {
  private running = false;
  private timeoutId: NodeJS.Timeout | null = null;
  private lastWake: Date | null = null;
  private runCount = 0;
  private lastGateDecision: string | null = null;
  private lastError: string | null = null;
  private bootstrapped = false;
  private runLog: RunLogEntry[] = [];

  async start(): Promise<void> {
    if (this.running) {
      console.log("[daemon] 已在运行，忽略 start");
      return;
    }

    if (!this.bootstrapped) {
      initWakeConfig();
      initHolidayCache();
      this.bootstrapped = true;
      console.log("[daemon] 初始化完成: wakeConfig + holidayCache");
    }

    this.running = true;
    this.lastError = null;
    console.log("[daemon] 启动 — 首次唤醒立即执行");

    await this.wake();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log("[daemon] 已停止");
  }

  getStatus(): DaemonStatus {
    return {
      running: this.running,
      lastWake: this.lastWake,
      runCount: this.runCount,
      lastGateDecision: this.lastGateDecision,
      lastError: this.lastError,
    };
  }

  getRunLog(): RunLogEntry[] {
    return this.runLog;
  }

  private async wake(): Promise<void> {
    const wakeStart = Date.now();
    const dayType = getMarketDayType();
    let gate: GateResult | null = null;
    let error: string | null = null;

    try {
      this.lastWake = new Date();
      this.runCount += 1;

      console.log(`[daemon] 醒来 #${this.runCount} — ${dayType} — ${this.lastWake.toISOString()}`);

      if (dayType === "weekend" || dayType === "holiday") {
        console.log(`[daemon] ${dayType === "weekend" ? "周末" : "节假日"} — 仅心跳，跳过分析`);
        this.lastGateDecision = dayType;
        this.appendRunLog(dayType, null, null, Date.now() - wakeStart);
        this.scheduleNextWake(dayType);
        return;
      }

      const now = new Date();
      const dynamicTasks = getActiveDynamicTasks();
      const dueTasks = dynamicTasks.filter((task) => task.at <= now);
      for (const task of dueTasks) {
        removeDynamicTask(task.id);
      }
      if (dueTasks.length > 0) {
        console.log(
          `[daemon] ${dueTasks.length} 个到期动态任务:`,
          dueTasks.map((task) => task.reason).join(", "),
        );
      }

      const marketSummary = await this.buildMarketSummary();
      gate = await this.runGate(dayType, marketSummary, dueTasks);

      if (gate) {
        await this.handleGate(gate, dayType, dueTasks);
        this.lastGateDecision = gate.run
          ? `run: ${gate.recommended_agent} (${gate.recommended_pattern})`
          : `skip: ${gate.reasoning.slice(0, 80)}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.lastError = error;
      console.error("[daemon] 唤醒异常:", error);
    }

    this.appendRunLog(dayType, gate, error, Date.now() - wakeStart);
    this.scheduleNextWake(dayType);
  }

  private async buildMarketSummary(): Promise<string> {
    const parts: string[] = [];

    try {
      const spyBars = await fetchIntel(
        "/market/bars?symbol=SPY&timeframe=1d&limit=5",
      );
      if (spyBars && Array.isArray(spyBars) && spyBars.length > 0) {
        const last = spyBars[spyBars.length - 1];
        const prev = spyBars.length > 1 ? spyBars[spyBars.length - 2] : null;
        const changePct = prev && prev.close
          ? ((last.close - prev.close) / prev.close * 100).toFixed(2)
          : "N/A";
        parts.push(`SPY: ${last.close} (${changePct}%)`);
      }
    } catch {
      // ignore fetch failures in this heartbeat path.
    }

    try {
      const signals = await fetchIntel("/signals?status=new&limit=20");
      if (signals && Array.isArray(signals) && signals.length > 0) {
        const summary = signals.map((signal: Record<string, unknown>) => ({
          symbol: signal.symbol,
          type: signal.type,
          strength: signal.strength,
        }));
        parts.push(`signals: ${JSON.stringify(summary)}`);
      } else {
        parts.push("signals: []");
      }
    } catch {
      parts.push("signals: (fetch failed)");
    }

    try {
      const events = await fetchIntel("/events?days=3&limit=10");
      if (events && Array.isArray(events) && events.length > 0) {
        const names = events.map((event: Record<string, unknown>) => event.title ?? event.name ?? "?")
          .join(", ");
        parts.push(`events: ${names}`);
      }
    } catch {
      // ignore fetch failures in heartbeat mode
    }

    try {
      const regime = await fetchIntel("/market-agent/regime");
      if (regime && typeof regime === "object" && !Array.isArray(regime)) {
        const r = regime as Record<string, unknown>;
        parts.push(
          `regime: ${r.state ?? "?"} (confidence=${r.confidence ?? "?"}, ` +
          `indicators=${JSON.stringify(r.indicators ?? {})})`,
        );
      }
    } catch {
      parts.push("regime: (unavailable)");
    }

    return parts.join("\n") || "market data unavailable";
  }

  private async runGate(
    dayType: MarketDayType,
    marketSummary: string,
    dueTasks: DynamicWakeTask[],
  ): Promise<GateResult | null> {
    const dayTypeLabel: Record<MarketDayType, string> = {
      regular: "market-open",
      half_day: "half-day",
      holiday: "holiday",
      weekend: "weekend",
    };

    const taskInfo = dueTasks.length > 0
      ? `Due tasks: ${dueTasks.map((task) => `${task.reason} (priority=${task.priority})`).join(", ")}`
      : "No due dynamic tasks";

    const prompt = [
      `DayType: ${dayTypeLabel[dayType]}`,
      `market data: ${marketSummary}`,
      taskInfo,
      "",
      "请先推理后输出 JSON，不要输出额外文字",
    ].join("\n");

    try {
      const result = await generateText({
        model: getModel(),
        system: DAEMON_GATE_SYSTEM_PROMPT,
        prompt,
        temperature: 0.1,
        maxTokens: 800,
      });

      const text = result.text.trim();
      console.log(`[daemon] Gate raw output:`, text.slice(0, 200));

      const parsed = this.extractGateJson(text);
      if (parsed) return parsed;

      console.warn("[daemon] Gate output is not valid JSON, fallback run=false");
      return {
        run: false,
        complexity_score: 0,
        recommended_agent: null,
        recommended_pattern: null,
        symbols: [],
        reasoning: "Gate output parsing failed",
      };
    } catch (err) {
      console.error("[daemon] Gate call failed:", err);
      return null;
    }
  }

  private extractGateJson(text: string): GateResult | null {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.run === "boolean") {
        return parsed as GateResult;
      }
    } catch {
      // ignored
    }

    const jsonMatch = text.match(/\{[\s\S]*"run"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.run === "boolean") {
          return parsed as GateResult;
        }
      } catch {
        // ignored
      }
    }

    return null;
  }

  private async handleGate(
    gate: GateResult,
    dayType: MarketDayType,
    dueTasks: DynamicWakeTask[],
  ): Promise<void> {
    if (!gate.run) {
      const needSchedule = /scheduleWakeup|schedule.*wake/i.test(gate.reasoning);
      if (needSchedule) {
        const now = new Date();
        const wakeAt = new Date(now.getTime() + 30 * 60 * 1000);
        addDynamicTask({
          at: wakeAt,
          reason: `Gate scheduled: ${gate.reasoning.slice(0, 80)}`,
          priority: "normal",
          createdBy: "daemon-gate",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        });
        console.log(`[daemon] Gate requested schedule wakeup: ${wakeAt.toISOString()}`);
      }
      return;
    }

    if (!gate.recommended_agent) {
      console.warn("[daemon] Gate run=true but recommended_agent is null");
      return;
    }

    console.log(
      `[daemon] Gate requested run: ${gate.recommended_agent}` +
      ` pattern=${gate.recommended_pattern} symbols=${gate.symbols.join(",")}` +
      ` complexity=${gate.complexity_score} dueTasks=${dueTasks.length}`,
    );

    const handoff = await spawn(gate.recommended_agent, {
      dayType,
      symbols: gate.symbols,
      pattern: gate.recommended_pattern,
      complexityScore: gate.complexity_score,
      reasoning: gate.reasoning,
      scheduledFromTaskIds: dueTasks.map((task) => task.id),
    });

    console.log(
      `[daemon] Agent handoff created: ${handoff.agentId} with ${handoff.toolCount} tools` +
      (handoff.gate_decision
        ? ` gate_complexity=${handoff.gate_decision.complexity_score}` +
        ` gate_symbols=${handoff.gate_decision.symbols.join(",")}`
        : ""),
    );

    const executed = await executeAgent(handoff);
    if (executed.skipped) {
      console.log(`[daemon] Agent execution skipped: ${executed.reason ?? "unknown"}`);
      return;
    }

    const workflowData = executed.workflow?.data ?? {};
    console.log(
      `[daemon] DecisionGraph run completed: symbol=${executed.symbol}` +
      ` run_id=${executed.workflow?.run_id ?? "?"}` +
      ` action=${String(workflowData.action ?? "?")}` +
      ` decision_id=${String(workflowData.decision_id ?? "?")}`,
    );
  }

  private scheduleNextWake(dayType: MarketDayType): void {
    if (!this.running) return;

    const config = getFixedWakeConfig();
    const now = new Date();
    const hour = now.getHours();
    const key = this.resolveSessionKey(hour, dayType);
    const session = config[key];
    const intervalMs = session.intervalMinutes * 60 * 1000;

    console.log(`[daemon] 下次唤醒: ${intervalMs / 1000}s (${key})`);

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      if (this.running) {
        this.wake().catch((err) => {
          console.error("[daemon] wake 异步异常:", err);
          this.lastError = err instanceof Error ? err.message : String(err);
        });
      }
    }, intervalMs);
  }

  private resolveSessionKey(
    hour: number,
    dayType: MarketDayType,
  ): keyof ReturnType<typeof getFixedWakeConfig> {
    if (dayType === "weekend") return "weekend";
    if (dayType === "holiday") return "holiday";
    if (dayType === "half_day") return "halfDay";

    if (hour >= 4 && hour < 9) return "preMarket";
    if (hour >= 9 && hour < 16) return "marketOpen";
    if (hour >= 16 && hour < 20) return "postMarket";
    return "marketClosed";
  }

  private appendRunLog(
    dayType: MarketDayType,
    gate: GateResult | null,
    error: string | null,
    elapsedMs: number,
  ): void {
    this.runLog.push({
      timestamp: new Date().toISOString(),
      dayType,
      gate,
      error,
      elapsedMs,
    });

    if (this.runLog.length > HEARTBEAT_LOG_LIMIT) {
      this.runLog = this.runLog.slice(-HEARTBEAT_LOG_LIMIT);
    }
  }
}

export const daemon = new MarketAgentDaemon();

