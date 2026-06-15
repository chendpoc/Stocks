import { Command, CommanderError } from "commander";

import { CLI_FLAG_JSON } from "../constants/cliFlags.js";

const TOP_LEVEL_COMMANDS = [
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
] as const;

export function stripJsonFlag(args: string[]): string[] {
  return args.filter((item) => item !== CLI_FLAG_JSON);
}

export function buildCliProgram(): Command {
  const program = new Command()
    .name("trader-workflows")
    .description("Trader workflow runtime CLI")
    .allowUnknownOption(true)
    .showHelpAfterError(false);

  program.option(CLI_FLAG_JSON, "Output JSON envelope");

  for (const name of TOP_LEVEL_COMMANDS) {
    program
      .command(name)
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .option(CLI_FLAG_JSON, "Output JSON envelope")
      .action(() => {});
  }

  return program;
}

export function isCommanderUnknownCommandError(error: unknown): boolean {
  return error instanceof CommanderError && error.code === "commander.unknownCommand";
}

export async function validateTopLevelCommand(args: string[]): Promise<void> {
  const program = buildCliProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });

  await program.parseAsync(args, { from: "user" });
}
