import type { Stage1Runtime } from "../runtime/stage1Runtime.js";
import type { WorkflowEnvelope } from "../types/cli.js";
import { executeCommand } from "./program.js";

export async function handleCommandAsync(
  runtime: Stage1Runtime,
  args: string[],
): Promise<WorkflowEnvelope> {
  return executeCommand(runtime, args);
}
