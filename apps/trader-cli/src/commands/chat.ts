import * as readline from "node:readline";
import { fetchIntel } from "../api/client";
import { getModel } from "../llm/provider";
import { getAgentSystemPrompt, resolveAgentTools } from "../llm/buildAgentTools.js";
import { chatReAct } from "../llm/chatReAct.js";
import { logger, user } from "../log/index.js";
import { lessons } from "./lessons";

function printWorkflowRuns(runs: { runId: string; workflowId: string; label: string }[]) {
  if (runs.length === 0) return;
  for (const run of runs) {
    user.say(`[Workflow] ${run.workflowId} 已触发 — runId: ${run.runId}${run.label ? ` (${run.label})` : ""}`);
  }
}

export async function chatEval(prompt: string) {
  const tools = await resolveAgentTools();
  const system = await getAgentSystemPrompt();
  const result = await chatReAct({
    model: getModel(),
    system,
    tools,
    messages: [{ role: "user", content: prompt }],
    onStep: (trace) => {
      const act = trace.actions.length > 0 ? ` → ${trace.actions.join(", ")}` : "";
      logger.debug(
        { step: trace.step, actions: trace.actions },
        `${trace.thought.slice(0, 100)}${act}`,
      );
    },
  });
  user.say(`\n${result.text}`);
  printWorkflowRuns(result.workflowRuns);
  if (result.terminatedBy !== "natural") {
    user.say(`[终止: ${result.terminatedBy}]`);
  }
}

export async function chatTui() {
  const { launchTui } = await import("../tui/launch.js");
  await launchTui({ initialMenu: "chat", startInMenu: false });
}

export async function chatReadline() {
  user.say("Forward Market Intelligence — Agent Chat");
  user.say("命令 /help、/scan、/analyze SYMBOL、/lessons、/quit\n");

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
    const result = await chatReAct({
      model: getModel(),
      system,
      tools,
      messages: history.slice(-20),
      onStep: (trace) => {
        const act = trace.actions.length > 0
          ? `\n  Action → ${trace.actions.join(", ")}`
          : "";
        const obs = trace.observations
          ? `\n  Obs ← ${trace.observations.slice(0, 100)}`
          : "";
        logger.debug(
          {
            step: trace.step,
            tokensUsed: trace.tokensUsed,
            elapsedMs: trace.elapsedMs,
            actions: trace.actions,
          },
          `Thought: ${trace.thought.slice(0, 100)}…${act}${obs}`,
        );
      },
    });

    user.say(`\n${result.text}`);
    printWorkflowRuns(result.workflowRuns);
    if (result.terminatedBy !== "natural") {
      user.say(`[终止: ${result.terminatedBy} · ${result.totalTokens} tok · ${result.wallClockMs}ms]`);
    }

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
    user.say("/scan /analyze SYMBOL /lessons /quit");
    return;
  }
  if (input === "/scan") {
    const result = await fetchIntel("/signals/scan", { method: "POST" });
    user.say(`扫描完成: ${result.signal_count} 条新信号`);
    return;
  }
  if (input.startsWith("/analyze ")) {
    const symbol = input.split(" ")[1];
    const tools = await resolveAgentTools();
    const system = await getAgentSystemPrompt();
    const result = await chatReAct({
      model: getModel(),
      system,
      tools,
      messages: [{ role: "user", content: `分析 ${symbol}，先调 buildContext 再给出结论。` }],
      onStep: (trace) => {
        const act = trace.actions.length > 0 ? ` → ${trace.actions.join(", ")}` : "";
        logger.debug(
          { step: trace.step, actions: trace.actions },
          `${trace.thought.slice(0, 100)}${act}`,
        );
      },
    });
    user.say(`\n${result.text}`);
    printWorkflowRuns(result.workflowRuns);
    return;
  }
  if (input === "/lessons") {
    await lessons();
  }
}
