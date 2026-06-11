#!/usr/bin/env node
import "./bootstrap-env";
import { Command } from "commander";

import { analyze } from "./commands/analyze";
import { brief } from "./commands/brief";
import { chart } from "./commands/chart";
import { chat } from "./commands/chat";
import { config } from "./commands/config";
import { data } from "./commands/data";
import { hypotheses } from "./commands/hypotheses";
import { lessons } from "./commands/lessons";
import { report } from "./commands/report";
import { review } from "./commands/review";
import { registerDecideCommand } from "./commands/decide";
import { registerOutcomesCommands } from "./commands/outcomes";
import { registerEvalCommands } from "./commands/eval";
import { registerInsightsCommands } from "./commands/insights";
import { workflowCommand } from "./commands/workflow";
import { registerGuidedPaperCommands } from "./commands/guidedPaper";
import { marketPlane } from "./commands/marketPlane";
import { registerRunsCommands } from "./commands/runs";
import { scan } from "./commands/scan";
import { daemonCommand } from "./commands/daemon";
import { server } from "./commands/server";
import { signals } from "./commands/signals";

const program = new Command();

program.name("trader").description("Forward Market Intelligence CLI").version("0.1.0");

program
  .command("tui", { isDefault: true, hidden: true })
  .description("Ink TUI main panel")
  .action(async () => {
    const { launchTui } = await import("./tui/launch.js");
    await launchTui();
  });

program.command("scan").description("Run signal scan").action(scan);
program
  .command("analyze")
  .argument("<symbol>", "Symbol to analyze")
  .description("Deep analysis with LLM")
  .action(analyze);
program.command("brief").description("Premarket brief data pack").action(brief);
program.command("review").description("Close postmortem data pack").action(review);
program
  .command("signals")
  .argument("[symbol]", "Optional symbol filter")
  .description("List signals")
  .action(signals);
program
  .command("hypotheses")
  .argument("[symbol]", "Optional symbol filter")
  .description("List hypotheses")
  .action(hypotheses);
program
  .command("lessons")
  .argument("[symbol]", "Optional symbol filter")
  .description("List lessons")
  .action(lessons);
program
  .command("chat")
  .description("Interactive agent chat (ink TUI when TTY)")
  .option("--eval <prompt>", "Non-interactive one-shot prompt (for CI/smoke)")
  .action((opts: { eval?: string }) => chat(opts));
program
  .command("report")
  .argument("<symbol>", "Symbol for daily report")
  .description("Generate or load cached LLM report")
  .action(report);
program
  .command("chart")
  .argument("<symbol>", "Symbol for ASCII chart")
  .description("ASCII price chart from market_bars")
  .action(chart);
program
  .command("server")
  .argument("<action>", "start | stop | status")
  .description("Manage trader-agent backend lifecycle")
  .action(server);
program
  .command("daemon")
  .argument("<action>", "start | stop | status")
  .description("Manage Market Agent Daemon lifecycle")
  .action(daemonCommand);
program
  .command("data")
  .argument("<action>", "status | ingest")
  .description("Market data ingest / status")
  .action(data);
program
  .command("market-plane")
  .argument("<action>", "symbols | state | ingest | stream-start | stream-stop | stream-status")
  .argument("[symbol]", "Symbol for state/ingest")
  .description("LiveMarketDataPlane v0 inspection (M2)")
  .action(marketPlane);
program
  .command("config")
  .argument("<action>", "show | set")
  .argument("[key]", "Env key for set")
  .argument("[value]", "Value for set")
  .description("Show or set CLI env config")
  .action(config);

registerRunsCommands(program);
registerDecideCommand(program);
program
  .command("workflow")
  .argument("<action>", "list | run <id> | status <runId>")
  .argument("[arg1]", "workflowId / runId")
  .allowUnknownOption()
  .description("直接管理 Workflow（list/run/status）")
  .action((action: string, arg1?: string, opts?: Record<string, unknown>) => {
    const rest = (opts as { args?: string[] })?.args ?? process.argv.slice(process.argv.indexOf("workflow") + 3);
    return workflowCommand(action, arg1, ...rest);
  });
registerOutcomesCommands(program);
registerEvalCommands(program);
registerInsightsCommands(program);
registerGuidedPaperCommands(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
