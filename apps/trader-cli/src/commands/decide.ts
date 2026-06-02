import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { findRepoRoot } from "../services/repoRoot.js";

interface DecideCommandOptions {
  json?: boolean;
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

export function decide(symbol: string, _options?: DecideCommandOptions): void {
  runWorkflowCommand(["decide", symbol.toUpperCase()]);
}

export function registerDecideCommand(program: Command): void {
  program
    .command("decide")
    .description("Run DecisionGraph for a symbol")
    .argument("<symbol>", "Symbol to decide on")
    .option("--json", "Output raw workflow JSON envelope")
    .action((symbol: string, options: DecideCommandOptions) => decide(symbol, options));
}
