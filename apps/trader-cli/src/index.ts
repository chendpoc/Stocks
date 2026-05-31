#!/usr/bin/env node
import "./bootstrap-env";
import { Command } from "commander";
import { analyze } from "./commands/analyze";
import { brief } from "./commands/brief";
import { chat } from "./commands/chat";
import { hypotheses } from "./commands/hypotheses";
import { lessons } from "./commands/lessons";
import { review } from "./commands/review";
import { scan } from "./commands/scan";
import { signals } from "./commands/signals";

const program = new Command();

program.name("trader").description("Forward Market Intelligence CLI").version("0.1.0");

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
  .description("Interactive agent chat")
  .option("--eval <prompt>", "Non-interactive one-shot prompt (for CI/smoke)")
  .action((opts: { eval?: string }) => chat(opts));

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
