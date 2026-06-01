#!/usr/bin/env node
import "./bootstrap-env";
import { ensureLongbridgeAgentOnStartup } from "./services/longbridgeAgent.js";
import { Command } from "commander";

await ensureLongbridgeAgentOnStartup();
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
import { scan } from "./commands/scan";
import { server } from "./commands/server";
import { signals } from "./commands/signals";

const program = new Command();

program.name("trader").description("Forward Market Intelligence CLI").version("0.1.0");

program
  .command("tui", { isDefault: true, hidden: true })
  .description("Ink TUI main panel")
  .action(async () => {
    const { launchTui } = await import("./tui/launch.js");
    launchTui();
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
  .command("data")
  .argument("<action>", "status | ingest")
  .description("Market data ingest / status")
  .action(data);
program
  .command("config")
  .argument("<action>", "show | set")
  .argument("[key]", "Env key for set")
  .argument("[value]", "Value for set")
  .description("Show or set CLI env config")
  .action(config);

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
