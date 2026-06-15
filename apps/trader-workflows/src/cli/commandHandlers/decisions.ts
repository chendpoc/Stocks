import { listModelDecisions } from "../../data/marketAgent.js";
import { CLI_FLAG_LIMIT, CLI_FLAG_MODEL_VERSION, CLI_FLAG_SYMBOL } from "../../constants/cliFlags.js";
import { ERROR_CODE_UNKNOWN_DECISIONS_COMMAND } from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { parseOptionalFlagValue, parsePositiveIntegerFlag } from "../argParser.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleDecisionsListCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const symbol = parseOptionalFlagValue(args, CLI_FLAG_SYMBOL);
  const modelVersion = parseOptionalFlagValue(args, CLI_FLAG_MODEL_VERSION);
  const limit = parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 500);
  const response = await listModelDecisions({
    symbol,
    model_version: modelVersion,
    limit,
  });
  return toEnvelope({
    ok: true,
    command: "decisions list",
    data: {
      model_decisions: response.items,
      count: response.count,
    },
  });
}

export async function handleDecisionsCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "list") {
    return handleDecisionsListCommandAsync(_runtime, args);
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_DECISIONS_COMMAND,
    `Unknown decisions command: ${sub ?? "(missing)"} (use list)`,
  );
}
