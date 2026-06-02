import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { findRepoRoot } from "../services/repoRoot.js";

interface InsightsExploreOptions {
  json?: boolean;
  symbol?: string;
  window?: string;
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

export function insightsExplore(options: InsightsExploreOptions): void {
  if (!options.symbol) {
    throw new Error("--symbol is required");
  }
  if (!options.window) {
    throw new Error("--window is required");
  }

  runWorkflowCommand([
    "insights",
    "explore",
    "--symbol",
    options.symbol.toUpperCase(),
    "--window",
    options.window,
  ]);
}

export function registerInsightsCommands(program: Command): void {
  const insightsCmd = program
    .command("insights")
    .description("InsightExplorationGraph commands");

  insightsCmd
    .command("explore")
    .description("Controlled ReAct exploration; persist InsightCandidate only")
    .requiredOption("--symbol <symbol>", "Symbol to explore")
    .requiredOption("--window <window>", "Lookback window (e.g. 30d, 7d)")
    .option("--json", "Output raw workflow JSON envelope")
    .action((options: InsightsExploreOptions) => insightsExplore(options));
}
