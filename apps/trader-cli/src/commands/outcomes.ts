import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { findRepoRoot } from "../services/repoRoot.js";

interface OutcomesCommandOptions {
  json?: boolean;
  due?: boolean;
  symbol?: string;
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

export function outcomesRun(options: OutcomesCommandOptions): void {
  if (!options.due) {
    throw new Error("outcomes run currently supports --due only");
  }
  const args = ["outcomes", "run", "--due"];
  if (options.symbol) {
    args.push("--symbol", options.symbol.toUpperCase());
  }
  if (options.limit) {
    args.push("--limit", options.limit);
  }
  runWorkflowCommand(args);
}

export function registerOutcomesCommands(program: Command): void {
  const outcomes = program.command("outcomes").description("OutcomeGraph commands");

  outcomes
    .command("run")
    .description("Run OutcomeGraph")
    .option("--due", "Process due pending decision outcomes")
    .option("--symbol <symbol>", "Optional symbol filter")
    .option("--limit <n>", "Max due rows to process", "100")
    .option("--json", "Output raw workflow JSON envelope")
    .action((options: OutcomesCommandOptions) => outcomesRun(options));
}
