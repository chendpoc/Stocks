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

import { parseArgs } from "./cli/argParser.js";
import { handleCommandAsync } from "./cli/router.js";
import { printEnvelope, toErrorEnvelope } from "./cli/helpers.js";
import { Stage1Runtime } from "./runtime/stage1Runtime.js";

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const commandLabel =
    parsed.commandArgs.length > 0 ? parsed.commandArgs.join(" ") : "(none)";
  const runtime = new Stage1Runtime();
  try {
    const envelope = await handleCommandAsync(runtime, parsed.commandArgs);
    printEnvelope(envelope);
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
