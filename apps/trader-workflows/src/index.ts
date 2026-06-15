#!/usr/bin/env node
import "./bootstrap-env.js";
import { pathToFileURL } from "node:url";

export {
  alphaResearchGraph,
  buildAlphaResearchGraph,
  runAlphaResearchGraph,
} from "./graphs/04-alphaResearch/alphaResearchGraph.js";
export type {
  AlphaResearchGraphDeps,
  AlphaResearchGraphInput,
  AlphaResearchGraphResult,
} from "./graphs/04-alphaResearch/alphaResearchGraph.types.js";
export {
  buildRuleCandidateRequest,
  validateAlphaResearchInput,
  type AlphaResearchInput,
  type AlphaInputValidationReport,
} from "./services/alphaResearch.js";
export {
  buildAlphaSeedV1,
  type AlphaSeedV1,
} from "./services/insightCandidates.js";

export { handleCommandAsync } from "./cli/router.js";

import { buildProgram, stripJsonFlag, validateTopLevelCommand } from "./cli/program.js";
import { printEnvelope, toErrorEnvelope } from "./cli/helpers.js";
import { logger } from "./cli/logger.js";
import { Stage1Runtime } from "./runtime/stage1Runtime.js";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const commandArgs = stripJsonFlag(rawArgs);
  const commandLabel = commandArgs.length > 0 ? commandArgs.join(" ") : "(none)";
  logger.debug({ command: commandLabel }, "cli.command");
  const runtime = new Stage1Runtime();
  try {
    await validateTopLevelCommand(rawArgs);
    const program = buildProgram(runtime);
    await program.parseAsync(rawArgs, { from: "user" });
  } catch (error) {
    printEnvelope(toErrorEnvelope(commandLabel, error));
    process.exitCode = 1;
  } finally {
    runtime.close();
  }
}

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isCliEntrypoint()) {
  void main();
}
