import { generateText } from "ai";
import { getModel } from "../llm/provider.js";
import { DAEMON_GATE_SYSTEM_PROMPT } from "../llm/prompts/daemonGate.js";
import type { DynamicWakeTask, MarketDayType } from "./wakeSchedule.js";
import type { GateResult } from "./types.js";

export function extractGateJson(text: string): GateResult | null {
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

export async function runDaemonGate(
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

    const parsed = extractGateJson(text);
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
