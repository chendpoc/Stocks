import { initMarketAgentMemory } from "../../data/marketAgent.js";
import {
  ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
} from "../../constants/errorCodes.js";
import type { Stage1Runtime } from "../../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../../types/cli.js";
import { toEnvelope, WorkflowCommandError } from "../helpers.js";

export async function handleMemoryCommandAsync(
  _runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  const sub = args[1];
  if (sub === "init") {
    const response = await initMarketAgentMemory();
    return toEnvelope({
      ok: true,
      command: "memory init",
      data: response,
    });
  }
  throw new WorkflowCommandError(
    ERROR_CODE_UNKNOWN_MEMORY_COMMAND,
    `Unknown memory command: ${sub ?? "(missing)"} (use init)`,
  );
}
