import {
  ERROR_CODE_COMMAND_REQUIRED,
  ERROR_CODE_UNKNOWN_COMMAND,
} from "../constants/errorCodes.js";
import type { Stage1Runtime } from "../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import { handleContextCommandAsync } from "./commandHandlers/context.js";
import { handleDecideCommandAsync } from "./commandHandlers/decide.js";
import { handleDecisionsCommandAsync } from "./commandHandlers/decisions.js";
import { handleEvalSummaryCommandAsync } from "./commandHandlers/eval.js";
import { handleFailureMemoryCommandAsync } from "./commandHandlers/failureMemory.js";
import { handleInsightsCommandAsync } from "./commandHandlers/insights.js";
import { handleMarketDataCommandAsync } from "./commandHandlers/marketData.js";
import { handleMarketMonitorRunCommandAsync } from "./commandHandlers/marketMonitor.js";
import { handleMemoryCommandAsync } from "./commandHandlers/memory.js";
import { handleOutcomesCommandAsync } from "./commandHandlers/outcomes.js";
import { handlePatternMemoryCommandAsync } from "./commandHandlers/patternMemory.js";
import { handleRunsCommandAsync } from "./commandHandlers/runs.js";
import { WorkflowCommandError } from "./helpers.js";

export type HandlerFn = (
  runtime: Stage1Runtime,
  args: string[],
) => Promise<WorkflowEnvelope>;

const COMMAND_HANDLERS: Record<string, HandlerFn> = {
  memory: handleMemoryCommandAsync,
  runs: handleRunsCommandAsync,
  decide: handleDecideCommandAsync,
  outcomes: handleOutcomesCommandAsync,
  decisions: handleDecisionsCommandAsync,
  eval: handleEvalSummaryCommandAsync,
  insights: handleInsightsCommandAsync,
  context: handleContextCommandAsync,
  "market-monitor": handleMarketMonitorRunCommandAsync,
  "market-data": handleMarketDataCommandAsync,
  "pattern-memory": handlePatternMemoryCommandAsync,
  "failure-memory": handleFailureMemoryCommandAsync,
};

export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  if (args.length === 0) {
    throw new WorkflowCommandError(
      ERROR_CODE_COMMAND_REQUIRED,
      "Command required (expected: memory init | runs list|show|resume|monitor|trace | decide SYMBOL | decisions list | context snapshots list|show | context bootstrap|latest | outcomes run --due|list | eval summary | insights explore|list | pattern-memory list|promote|degrade | failure-memory list | market-monitor run | market-data fetch|health|quality)",
    );
  }
  const handler = COMMAND_HANDLERS[args[0]];
  if (!handler) {
    throw new WorkflowCommandError(
      ERROR_CODE_UNKNOWN_COMMAND,
      `Unknown command: ${args[0]} (currently supported: memory, runs, decide, decisions, context, outcomes, eval, insights, pattern-memory, failure-memory, market-monitor, market-data)`,
    );
  }
  return handler(runtime, args);
}
