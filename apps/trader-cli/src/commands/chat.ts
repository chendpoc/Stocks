import * as readline from "node:readline";
import { generateText } from "ai";
import { fetchIntel } from "../api/client";
import { getModel } from "../llm/provider";
import { getAgentSystemPrompt, resolveAgentTools } from "../llm/buildAgentTools.js";
import { lessons } from "./lessons";

export async function chatEval(prompt: string) {
  const tools = await resolveAgentTools();
  const system = await getAgentSystemPrompt();
  const result = await generateText({
    model: getModel(),
    system,
    prompt,
    tools,
    maxSteps: 10,
  });
  for (const step of result.toolCalls ?? []) {
    console.log(`[工具] ${step.toolName}`);
  }
  console.log(`\n${result.text}`);
}

export async function chatTui() {
  const { launchTui } = await import("../tui/launch.js");
  launchTui({ initialMenu: "chat", startInMenu: false });
}

export async function chatReadline() {
  console.log("Forward Market Intelligence — Agent Chat");
  console.log("命令 /help、/scan、/analyze SYMBOL、/lessons、/quit\n");

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

    const tools = await resolveAgentTools();
    const system = await getAgentSystemPrompt();
    const result = await generateText({
      model: getModel(),
      system,
      messages: history.slice(-20),
      tools,
      maxSteps: 10,
    });

    for (const step of result.toolCalls ?? []) {
      console.log(`[工具] ${step.toolName}`);
    }

    console.log(`\n${result.text}`);
    history.push({ role: "assistant", content: result.text });
  }

  rl.close();
}

export async function chat(options?: { eval?: string }) {
  if (options?.eval) {
    await chatEval(options.eval);
    return;
  }
  if (process.stdin.isTTY) {
    await chatTui();
    return;
  }
  await chatReadline();
}

async function handleSlashCommand(input: string) {
  if (input === "/help") {
    console.log("/scan /analyze SYMBOL /lessons /quit");
    return;
  }
  if (input === "/scan") {
    const result = await fetchIntel("/signals/scan", { method: "POST" });
    console.log(`扫描完成: ${result.signal_count} 条新信号`);
    return;
  }
  if (input.startsWith("/analyze ")) {
    const symbol = input.split(" ")[1];
    const tools = await resolveAgentTools();
    const system = await getAgentSystemPrompt();
    const result = await generateText({
      model: getModel(),
      system,
      prompt: `分析 ${symbol}，先调 buildContext 再给出结论。`,
      tools,
      maxSteps: 10,
    });
    console.log(`\n${result.text}`);
    return;
  }
  if (input === "/lessons") {
    await lessons();
  }
}
