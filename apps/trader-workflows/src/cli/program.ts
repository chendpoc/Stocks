/**
 * S2/S3: commander 子命令树 + zod typed opts（S2/S3 命令已接入 action）
 *
 * 生产路径仍经 router.handleCommandAsync；S6 切换 index main → parseAsync。
 */

import { Command, CommanderError } from "commander";

import { CLI_FLAG_JSON } from "../constants/cliFlags.js";
import {
  ERROR_CODE_COMMAND_REQUIRED,
  ERROR_CODE_UNKNOWN_COMMAND,
} from "../constants/errorCodes.js";
import type { Stage1Runtime } from "../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import {
  DecisionsListOpts,
  handleDecisionsListCommandAsync,
} from "./commandHandlers/decisions.js";
import {
  FailureMemoryListOpts,
  handleFailureMemoryListCommandAsync,
} from "./commandHandlers/failureMemory.js";
import {
  handleInsightsListCommandAsync,
  InsightsListOpts,
} from "./commandHandlers/insights.js";
import {
  handleMarketDataFetchCommandAsync,
  handleMarketDataHealthCommandAsync,
  handleMarketDataQualityCommandAsync,
  MarketDataHealthOpts,
  parseMarketDataFetchOpts,
  parseMarketDataQualityOpts,
} from "./commandHandlers/marketData.js";
import {
  handleMemoryInitCommandAsync,
  MemoryInitOpts,
} from "./commandHandlers/memory.js";
import {
  handleOutcomesListCommandAsync,
  parseOutcomesListOpts,
} from "./commandHandlers/outcomes.js";
import {
  handlePatternMemoryListCommandAsync,
  PatternMemoryListOpts,
} from "./commandHandlers/patternMemory.js";
import {
  handleRunsListCommandAsync,
  handleRunsMonitorCommandAsync,
  handleRunsResumeCommandAsync,
  handleRunsShowCommandAsync,
  handleRunsTraceCommandAsync,
  parseRunsMonitorOpts,
  RunsListOpts,
  RunsResumeOpts,
  RunsShowOpts,
  RunsTraceOpts,
} from "./commandHandlers/runs.js";
import { WorkflowCommandError } from "./helpers.js";
import { parseOpts } from "./parseOpts.js";

/* ───────── 常量 ───────── */

const SUPPORTED_COMMANDS =
  "memory, runs, decide, decisions, context, outcomes, eval, insights, pattern-memory, failure-memory, market-monitor, market-data";

const TOP_LEVEL_COMMANDS = new Set([
  "memory",
  "runs",
  "decide",
  "decisions",
  "context",
  "outcomes",
  "eval",
  "insights",
  "pattern-memory",
  "failure-memory",
  "market-monitor",
  "market-data",
]);

/* ───────── 工具 ───────── */

/** 从 args 中移除 --json flag（避免干扰 handler 内 flag 解析） */
export function stripJsonFlag(args: string[]): string[] {
  return args.filter((item) => item !== CLI_FLAG_JSON);
}

/* ───────── 构建完整程序树 ───────── */

/**
 * 构建完整的 commander 程序树。
 * S2/S3: runs / decisions / memory / failure-memory / outcomes list / insights list /
 * market-data * / pattern-memory list actions 已接入 zod + handler。
 */
export function buildProgram(runtime: Stage1Runtime): Command {
  const program = new Command()
    .name("trader-workflows")
    .description("Trader workflow runtime CLI")
    .showHelpAfterError(false)
    .exitOverride();

  program.option(CLI_FLAG_JSON, "Output JSON envelope");

  // ── memory ──
  const memory = program.command("memory").description("Memory management");
  memory
    .command("init")
    .description("Initialize market agent memory")
    .action(async () =>
      handleMemoryInitCommandAsync(runtime, parseOpts(MemoryInitOpts, {})),
    );

  // ── runs ──
  const runs = program.command("runs").description("Workflow run management");
  runs
    .command("list")
    .description("List recent runs")
    .option("--limit <n>", "Max results", "50")
    .action(async (rawOpts: { limit?: string }) =>
      handleRunsListCommandAsync(runtime, parseOpts(RunsListOpts, rawOpts)),
    );
  runs
    .command("show")
    .description("Show a run")
    .argument("<run-id>", "Run ID")
    .action(async (runId: string) =>
      handleRunsShowCommandAsync(runtime, parseOpts(RunsShowOpts, { runId })),
    );
  runs
    .command("resume")
    .description("Resume a run")
    .argument("<run-id>", "Run ID")
    .action(async (runId: string) =>
      handleRunsResumeCommandAsync(runtime, parseOpts(RunsResumeOpts, { runId })),
    );
  runs
    .command("monitor")
    .description("Monitor active runs")
    .option("--limit <n>", "Max results")
    .option("--status <status>", "Filter by status")
    .option("--graph-name <name>", "Filter by graph")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleRunsMonitorCommandAsync(runtime, parseRunsMonitorOpts(rawOpts)),
    );
  runs
    .command("trace")
    .description("Trace run events")
    .argument("<run-id>", "Run ID")
    .action(async (runId: string) =>
      handleRunsTraceCommandAsync(runtime, parseOpts(RunsTraceOpts, { runId })),
    );

  // ── decide ──
  program.command("decide").description("Run Decision graph")
    .argument("<symbol>", "Stock symbol (e.g. TSLA)")
    .option("--setup <name>", "Setup name", "default")
    .option("--gate-json <json>", "Gate decision JSON");

  // ── decisions ──
  const decisions = program.command("decisions").description("Model decisions");
  decisions
    .command("list")
    .description("List model decisions")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--model-version <version>", "Model version")
    .option("--limit <n>", "Max results", "500")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleDecisionsListCommandAsync(runtime, parseOpts(DecisionsListOpts, rawOpts)),
    );

  // ── context ──
  const context = program.command("context").description("Context management");
  context.command("bootstrap").description("Bootstrap context pack")
    .option("--session-id <id>", "Session ID")
    .option("--profile <profile>", "Profile name")
    .option("--symbol <symbol>", "Stock symbol")
    .option("--max-chars <n>", "Max characters")
    .option("--output <path>", "Output file path");
  context.command("latest").description("Get latest context")
    .option("--session-id <id>", "Session ID")
    .option("--profile <profile>", "Profile name")
    .option("--symbol <symbol>", "Stock symbol");
  const snapshots = context.command("snapshots").description("Context snapshots");
  snapshots.command("list").description("List snapshots")
    .requiredOption("--symbol <symbol>", "Stock symbol")
    .option("--limit <n>", "Max results", "20");
  snapshots.command("show").description("Show a snapshot").argument("<snapshot-id>", "Snapshot ID");

  // ── outcomes ──
  const outcomes = program.command("outcomes").description("Decision outcomes");
  outcomes
    .command("list")
    .description("List outcomes")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--status <status>", "Status filter")
    .option("--limit <n>", "Max results", "100")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleOutcomesListCommandAsync(runtime, parseOutcomesListOpts(rawOpts)),
    );
  outcomes.command("run").description("Run due outcomes")
    .requiredOption("--due", "Process due outcomes")
    .option("--symbol <symbol>", "Filter by symbol");

  // ── eval ──
  program.command("eval").description("Evaluation")
    .command("summary").description("Run evaluation summary")
    .option("--symbol <symbol>", "Stock symbol")
    .option("--model-version <version>", "Model version", "stage1-v0")
    .option("--limit <n>", "Max results", "500");

  // ── insights ──
  const insights = program.command("insights").description("Insight candidates");
  insights.command("explore").description("Run insight exploration")
    .requiredOption("--symbol <symbol>", "Stock symbol")
    .requiredOption("--window <window>", "Exploration window");
  insights
    .command("list")
    .description("List insight candidates")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--verification-status <status>", "Verification status")
    .option("--limit <n>", "Max results", "50")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleInsightsListCommandAsync(runtime, parseOpts(InsightsListOpts, rawOpts)),
    );

  // ── pattern-memory ──
  const pm = program.command("pattern-memory").description("Pattern memory");
  pm
    .command("list")
    .description("List pattern memories")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--pattern-id <id>", "Filter by pattern ID")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Max results")
    .action(async (rawOpts: Record<string, unknown>) =>
      handlePatternMemoryListCommandAsync(runtime, parseOpts(PatternMemoryListOpts, rawOpts)),
    );
  pm.command("promote").description("Promote pattern to candidate")
    .requiredOption("--confirm", "Confirmation flag")
    .option("--pattern-memory-id <id>", "Pattern memory ID")
    .option("--candidate-id <id>", "Candidate ID");
  pm.command("degrade").description("Degrade a pattern")
    .option("--pattern-memory-id <id>", "Pattern memory ID")
    .option("--pattern-id <id>", "Pattern ID")
    .option("--reason <reason>", "Reason");

  // ── failure-memory ──
  const failureMemory = program.command("failure-memory").description("Failure memory");
  failureMemory
    .command("list")
    .description("List failure memories")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--type <type>", "Failure type")
    .option("--failure-type <type>", "Alias for --type")
    .option("--setup <setup>", "Filter by setup")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Max results")
    .action(
      async (rawOpts: Record<string, unknown> & { type?: string; failureType?: string }) =>
        handleFailureMemoryListCommandAsync(
          runtime,
          parseOpts(FailureMemoryListOpts, {
            ...rawOpts,
            failureType: rawOpts.failureType ?? rawOpts.type,
          }),
        ),
    );

  // ── market-monitor ──
  program.command("market-monitor").description("Market monitor")
    .command("run").description("Run market monitor")
    .requiredOption("--symbols <csv>", "Comma-separated symbols")
    .requiredOption("--timeframes <csv>", "Comma-separated timeframes")
    .option("--limit <n>", "Max results")
    .option("--min-required <n>", "Minimum required")
    .option("--allow-live-fallback", "Allow live fallback");

  // ── market-data ──
  const md = program.command("market-data").description("Market data");
  md
    .command("fetch")
    .description("Fetch market data")
    .requiredOption("--symbol <symbol>", "Stock symbol")
    .option("--timeframe <timeframe>", "Data timeframe", "1d")
    .option("--limit <n>", "Max results")
    .option("--min-required <n>", "Minimum required")
    .option("--allow-live-fallback", "Allow live fallback")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleMarketDataFetchCommandAsync(runtime, parseMarketDataFetchOpts(rawOpts)),
    );
  md
    .command("health")
    .description("Check data health")
    .option("--symbol <symbol>", "Stock symbol")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleMarketDataHealthCommandAsync(runtime, parseOpts(MarketDataHealthOpts, rawOpts)),
    );
  md
    .command("quality")
    .description("Check data quality")
    .requiredOption("--symbol <symbol>", "Stock symbol")
    .option("--timeframe <timeframe>", "Data timeframe", "1d")
    .option("--limit <n>", "Max results")
    .option("--min-required <n>", "Minimum required")
    .action(async (rawOpts: Record<string, unknown>) =>
      handleMarketDataQualityCommandAsync(runtime, parseMarketDataQualityOpts(rawOpts)),
    );

  program.exitOverride((err) => {
    if (err instanceof CommanderError) {
      if (err.code === "commander.unknownCommand") {
        throw new WorkflowCommandError(
          ERROR_CODE_UNKNOWN_COMMAND,
          `Unknown command. Supported: ${SUPPORTED_COMMANDS}`,
        );
      }
      if (err.code === "commander.helpDisplayed" || err.code === "commander.help") {
        return;
      }
      throw new WorkflowCommandError(err.code, err.message);
    }
    throw err;
  });

  return program;
}

/* ───────── 公共 API ───────── */

/**
 * S1 hybrid: validate only the top-level verb so legacy handlers still own
 * subcommand/flag validation (required --confirm, --due, etc.).
 */
export async function validateTopLevelCommand(args: string[]): Promise<void> {
  const commandArgs = stripJsonFlag(args);
  if (commandArgs.length === 0 || commandArgs.every((a) => a.startsWith("-"))) {
    throw new WorkflowCommandError(
      ERROR_CODE_COMMAND_REQUIRED,
      `Command required. Supported: ${SUPPORTED_COMMANDS}`,
    );
  }

  const top = commandArgs[0];
  if (!TOP_LEVEL_COMMANDS.has(top)) {
    const err = new CommanderError("commander.unknownCommand", top);
    throw err;
  }
}

/**
 * 是否为 commander 的未知命令错误。
 */
export function isCommanderUnknownCommandError(error: unknown): boolean {
  return error instanceof CommanderError && error.code === "commander.unknownCommand";
}
