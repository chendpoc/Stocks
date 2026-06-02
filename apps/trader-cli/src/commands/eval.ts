import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { findRepoRoot } from "../services/repoRoot.js";

interface EvalCommandOptions {
  json?: boolean;
  symbol?: string;
  modelVersion?: string;
  limit?: string;
}

function runWorkflowCommand(args: string[]): void {
  const result = spawnSync(
    "npm",
    [
      "--prefix",
      "apps/trader-workflows",
      "run",
      "workflows",
      "--",
      ...args,
      "--json",
    ],
    {
      cwd: findRepoRoot(),
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    throw new Error(`Failed to run trader-workflows: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  const raw = (result.stdout ?? "").trim();
  if (!raw) {
    throw new Error("trader-workflows returned empty JSON envelope");
  }

  console.log(raw);
}

export function evalSummary(options: EvalCommandOptions): void {
  const args = ["eval", "summary"];
  if (options.symbol) {
    args.push("--symbol", options.symbol.toUpperCase());
  }
  if (options.modelVersion) {
    args.push("--model-version", options.modelVersion);
  }
  if (options.limit) {
    args.push("--limit", options.limit);
  }
  runWorkflowCommand(args);
}

export function registerEvalCommands(program: Command): void {
  const evalCmd = program.command("eval").description("EvaluationGraph commands");

  evalCmd
    .command("summary")
    .description("Aggregate outcomes and emit evaluation report")
    .option("--symbol <symbol>", "Optional symbol filter")
    .option("--model-version <version>", "Model version filter", "stage1-v0")
    .option("--limit <n>", "Max outcomes to read", "500")
    .option("--json", "Output raw workflow JSON envelope")
    .action((options: EvalCommandOptions) => evalSummary(options));
}
