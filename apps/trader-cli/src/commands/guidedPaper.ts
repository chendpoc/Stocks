import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
  getExecutionPolicy,
  registerExecutionPolicy,
  runGuidedPaperExploration,
} from "../services/guidedPaper.js";
import { user } from "../log/index.js";

function readPolicyFile(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Policy file must contain a JSON object: ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

export async function guidedPaperPolicyRegister(filePath: string): Promise<void> {
  const policy = readPolicyFile(filePath);
  user.json("ExecutionPolicy registered", await registerExecutionPolicy(policy));
}

export async function guidedPaperPolicyGet(executionPolicyId: string): Promise<void> {
  user.json(`ExecutionPolicy ${executionPolicyId}`, await getExecutionPolicy(executionPolicyId));
}

export async function guidedPaperRun(options: {
  policy: string;
  symbol: string;
  direction?: string;
  quantity?: string;
  approve?: boolean;
}): Promise<void> {
  const quantity = options.quantity ? Number(options.quantity) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("--quantity must be a positive number");
  }
  user.json(
    `Guided paper run ${options.symbol}`,
    await runGuidedPaperExploration({
      execution_policy_id: options.policy,
      symbol: options.symbol,
      direction: options.direction ?? "buy",
      quantity,
      approval_granted: options.approve ?? false,
    }),
  );
}

export function registerGuidedPaperCommands(program: Command): void {
  const guided = program
    .command("guided-paper")
    .description("M4 guided paper exploration (ExecutionPolicy → RiskGate → paper fill)");

  guided
    .command("policy-register")
    .argument("<file>", "ExecutionPolicy JSON file")
    .description("Register an ExecutionPolicy with the backend")
    .action((file: string) => guidedPaperPolicyRegister(file));

  guided
    .command("policy-get")
    .argument("<executionPolicyId>", "execution_policy_id")
    .description("Fetch a stored ExecutionPolicy")
    .action((id: string) => guidedPaperPolicyGet(id));

  guided
    .command("run")
    .requiredOption("--policy <id>", "execution_policy_id")
    .requiredOption("--symbol <symbol>", "Symbol, e.g. AAPL.US")
    .option("--direction <direction>", "buy or sell", "buy")
    .option("--quantity <n>", "Order quantity", "1")
    .option("--approve", "Set approval_granted when operator_gate requires it", false)
    .description("Run guided paper exploration for one symbol")
    .action((options) => guidedPaperRun(options));
}
