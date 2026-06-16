import { executeAgent, spawn } from "./agentFactory.js";
import { addDynamicTask } from "./wakeSchedule.js";
import type { DynamicWakeTask, MarketDayType } from "./wakeSchedule.js";
import type { GateResult } from "./types.js";

export async function handleDaemonGate(
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
