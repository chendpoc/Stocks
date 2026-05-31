import * as readline from "node:readline";
import { generateText } from "ai";
import { fetchIntel } from "../api/client";
import { getModel } from "../llm/provider";
import { INTEL_TOOLS, SYSTEM_PROMPT } from "../llm/tools";
import { lessons } from "./lessons";

export async function chatEval(prompt: string) {
  const result = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt,
    tools: INTEL_TOOLS,
    maxSteps: 10,
  });
  for (const step of result.toolCalls ?? []) {
    console.log(`[????] ${step.toolName}`);
  }
  console.log(`\n${result.text}`);
}

export async function chat(options?: { eval?: string }) {
  if (options?.eval) {
    await chatEval(options.eval);
    return;
  }

  console.log("Forward Market Intelligence ? Agent Chat");
  console.log("?? /help ?????/quit ??\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: { role: "user" | "assistant"; content: string }[] = [];

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  while (true) {
    const input = await ask("\n> ");
    if (!input) continue;
    if (input === "/quit") break;

    if (input.startsWith("/")) {
      await handleSlashCommand(input);
      continue;
    }

    history.push({ role: "user", content: input });

    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      messages: history,
      tools: INTEL_TOOLS,
      maxSteps: 10,
    });

    for (const step of result.toolCalls ?? []) {
      console.log(`[????] ${step.toolName}`);
    }

    console.log(`\n${result.text}`);
    history.push({ role: "assistant", content: result.text });
  }

  rl.close();
}

async function handleSlashCommand(input: string) {
  if (input === "/help") {
    console.log("/scan /analyze SYMBOL /lessons /quit");
    return;
  }
  if (input === "/scan") {
    const result = await fetchIntel("/signals/scan", { method: "POST" });
    console.log(`????: ${result.signal_count} ???`);
    return;
  }
  if (input.startsWith("/analyze ")) {
    const symbol = input.split(" ")[1];
    const result = await generateText({
      model: getModel(),
      system: SYSTEM_PROMPT,
      prompt: `????? ${symbol}??? buildContext ?????????????`,
      tools: INTEL_TOOLS,
      maxSteps: 10,
    });
    console.log(`\n${result.text}`);
    return;
  }
  if (input === "/lessons") {
    await lessons();
  }
}
