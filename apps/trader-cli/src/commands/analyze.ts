import { generateText } from "ai";
import { getModel } from "../llm/provider";
import { INTEL_TOOLS, SYSTEM_PROMPT } from "../llm/tools";

export async function analyze(symbol: string) {
  const result = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt: `?? ${symbol.toUpperCase()} ??????????????????????????`,
    tools: INTEL_TOOLS,
    maxSteps: 10,
  });

  console.log(`\n${result.text}`);
}
