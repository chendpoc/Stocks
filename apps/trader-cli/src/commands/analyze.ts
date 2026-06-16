import { generateText } from "ai";
import { getModel } from "../llm/provider";
import { getAgentSystemPrompt, resolveAgentTools } from "../llm/buildAgentTools.js";
import { user } from "../log/index.js";

export async function analyze(symbol: string) {
  const tools = await resolveAgentTools();
  const system = await getAgentSystemPrompt();
  const result = await generateText({
    model: getModel(),
    system,
    prompt: `分析 ${symbol.toUpperCase()}：先 ingestSymbolBars（若无 K 线）与 buildContext，再给出可审计结论。`,
    tools,
    maxSteps: 10,
  });

  user.say(`\n${result.text}`);
}
