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

import {
  initWakeConfig,
  initHolidayCache,
  getActiveDynamicTasks,
  removeDynamicTask,
  getMarketDayType,
} from "./wakeSchedule.js";
import { buildMarketSummary } from "./marketSummary.js";
import { runDaemonGate } from "./gate.js";
import { handleDaemonGate } from "./gateHandler.js";
import { getDaemonWakeIntervalMs, resolveDaemonSessionKey } from "./scheduler.js";
import {
  HEARTBEAT_LOG_LIMIT,
  type DaemonStatus,
  type GateResult,
  type RunLogEntry,
} from "./types.js";

export type { DaemonStatus, GateResult, RunLogEntry } from "./types.js";

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

      const marketSummary = await buildMarketSummary();
      gate = await runDaemonGate(dayType, marketSummary, dueTasks);

      if (gate) {
        await handleDaemonGate(gate, dayType, dueTasks);
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

  private scheduleNextWake(dayType: ReturnType<typeof getMarketDayType>): void {
    if (!this.running) return;

    const now = new Date();
    const hour = now.getHours();
    const key = resolveDaemonSessionKey(hour, dayType);
    const intervalMs = getDaemonWakeIntervalMs(dayType, hour);

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

  private appendRunLog(
    dayType: ReturnType<typeof getMarketDayType>,
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
