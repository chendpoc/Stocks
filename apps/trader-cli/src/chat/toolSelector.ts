import type { CoreTool } from "ai";
import type { TaskClassification } from "./taskRouter.js";
import type { ToolView } from "./processedContext.js";

const QUICK_TOOLS = new Set([
  "getMarketBars",
  "getLongbridgeQuote",
  "getLongbridgeKline",
  "getLongbridgeIntraday",
  "describeTools",
  "describeTool",
]);

const ANALYSIS_TOOLS = new Set([
  ...QUICK_TOOLS,
  "getSignals",
  "scanSignals",
  "buildContext",
  "fetchRegime",
  "getEvents",
  "webSearch",
  "searchCnFinance",
  "analyzeSentiment",
  "getLongbridgeNews",
  "getLongbridgeValuation",
  "getLongbridgeConsensus",
  "describeTools",
  "describeTool",
]);

const REVIEW_TOOLS = new Set([
  "getLessons",
  "queryPatternHistory",
  "searchCorpus",
  "getRelatedHypotheses",
  "describeTools",
  "describeTool",
]);

const MEMORY_WRITE_TOOLS = new Set(["saveHypothesis"]);

export interface ToolSelection {
  tools: Record<string, CoreTool>;
  activeTools: string[];
  toolViews: ToolView[];
}

function listToolViews(allTools: Record<string, CoreTool>, names: string[]): ToolView[] {
  return names.map((name) => ({
    name,
    group: inferGroup(name),
    summary: typeof allTools[name]?.description === "string"
      ? allTools[name].description.slice(0, 120)
      : name,
    selected: true,
  }));
}

function inferGroup(name: string): string {
  if (name.startsWith("getLongbridge") || name === "longbridgeInvoke" || name === "listLongbridgeWatchlist") {
    return "longbridge";
  }
  if (["webSearch", "searchCnFinance", "fetchUrl", "searchRecentEvents", "extractNewsSignal", "analyzeSentiment"].includes(name)) {
    return "sentiment";
  }
  if (["listWorkflows", "runWorkflow", "getWorkflowStatus"].includes(name)) {
    return "workflow";
  }
  if (["searchCorpus", "getRelatedHypotheses", "getLessons", "saveHypothesis", "queryPatternHistory"].includes(name)) {
    return "memory";
  }
  return "market";
}

function pickBySet(allTools: Record<string, CoreTool>, allowed: Set<string>): string[] {
  return Object.keys(allTools).filter((name) => allowed.has(name));
}

export function selectTools(
  classification: TaskClassification,
  allTools: Record<string, CoreTool>,
): ToolSelection {
  let names: string[];

  switch (classification.mode) {
    case "quick":
      if (classification.requiredTools.length > 0) {
        names = classification.requiredTools.filter((n) => n in allTools);
      } else {
        names = pickBySet(allTools, QUICK_TOOLS);
      }
      break;
    case "analysis":
      names = pickBySet(allTools, ANALYSIS_TOOLS);
      break;
    case "review":
      names = pickBySet(allTools, REVIEW_TOOLS);
      break;
    case "decision":
    default:
      names = Object.keys(allTools).filter((n) => !MEMORY_WRITE_TOOLS.has(n));
      break;
  }

  if (!names.includes("describeTools") && "describeTools" in allTools) {
    names.push("describeTools");
  }
  if (!names.includes("describeTool") && "describeTool" in allTools) {
    names.push("describeTool");
  }

  const tools: Record<string, CoreTool> = {};
  for (const name of names) {
    if (allTools[name]) tools[name] = allTools[name];
  }

  return {
    tools,
    activeTools: names,
    toolViews: listToolViews(allTools, names),
  };
}
