import type { ZodType } from "zod";
import { ZodError } from "zod";

import { WorkflowCommandError } from "./helpers.js";

export function parseOpts<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  throw zodErrorToWorkflowCommandError(result.error);
}

function zodErrorToWorkflowCommandError(error: ZodError): WorkflowCommandError {
  const issue = error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "options";
  const message = issue?.message ?? "Invalid options";
  const code = path.replace(/([A-Z])/g, "_$1").replace(/\./g, "_").toUpperCase() + "_INVALID";
  return new WorkflowCommandError(code, `${path}: ${message}`);
}
