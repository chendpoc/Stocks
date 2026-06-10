import { generateText } from "ai";

import type { LlmNodeDeps } from "../graphs/00-decision/decisionGraph.llmNodes.js";
import { chatReAct } from "./chatReAct.js";
import { resolveEvidenceTools } from "./evidenceTools.js";
import {
  getFlashModel,
  getProModel,
  getProThinkingModel,
} from "./workflowModels.js";

let cachedDeps: LlmNodeDeps | null = null;

/** Default LLM node deps for DecisionGraph evidence / Swarm paths. */
export function createDecisionGraphLlmDeps(
  overrides: Partial<LlmNodeDeps> = {},
): LlmNodeDeps {
  return {
    getFlashModel: overrides.getFlashModel ?? getFlashModel,
    getProModel: overrides.getProModel ?? getProModel,
    getProThinkingModel: overrides.getProThinkingModel ?? getProThinkingModel,
    resolveTools: overrides.resolveTools ?? (() => resolveEvidenceTools()),
    generateTextFn:
      overrides.generateTextFn ??
      ((options) => generateText(options as Parameters<typeof generateText>[0])),
    chatReAct:
      overrides.chatReAct ??
      (async (opts) => {
        const result = await chatReAct(opts);
        return { text: result.text, wallClockMs: result.wallClockMs };
      }),
  };
}

export function getDecisionGraphLlmDeps(): LlmNodeDeps {
  if (!cachedDeps) {
    cachedDeps = createDecisionGraphLlmDeps();
  }
  return cachedDeps;
}

/** @internal tests */
export function resetDecisionGraphLlmDepsCache(): void {
  cachedDeps = null;
}
