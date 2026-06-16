import { generateText } from "ai";
import { fetchIntel } from "../api/client.js";
import { getModel } from "../llm/provider.js";
import { resolveAgentTools } from "../llm/buildAgentTools.js";
import type { ReportResult } from "./types.js";
import { todayDateString } from "../utils/date.js";
import { normalizeSymbol } from "../utils/symbol.js";

const REPORT_SYSTEM =
  "你是市场情报分析师。根据 context JSON 生成简洁的中文日报：核心观点、风险、可验证预测。避免绝对化用语。";

export async function runReport(symbol: string): Promise<ReportResult> {
  const sym = normalizeSymbol(symbol);
  const today = todayDateString();

  const check = await fetchIntel("/report/check", {
    method: "POST",
    body: JSON.stringify({ symbol: sym, date: today }),
  });

  if (check.hit) {
    return {
      hit: true,
      text: String(check.report ?? ""),
      cachedAt: check.cached_at != null ? String(check.cached_at) : undefined,
    };
  }

  const context = await fetchIntel("/context/build", {
    method: "POST",
    body: JSON.stringify({
      symbols: [sym],
      taskType: "signal_explanation",
    }),
  });

  const tools = await resolveAgentTools();
  const result = await generateText({
    model: getModel(),
    system: REPORT_SYSTEM,
    prompt: JSON.stringify(context),
    tools,
    maxSteps: 8,
  });

  await fetchIntel("/report/save", {
    method: "POST",
    body: JSON.stringify({
      symbol: sym,
      date: today,
      latest_signal_ts: check.latest_signal_ts ?? null,
      report_json: result.text,
    }),
  });

  return { hit: false, text: result.text };
}
