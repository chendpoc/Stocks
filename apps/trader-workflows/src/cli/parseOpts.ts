import type { ZodTypeAny } from "zod";
import { z, ZodError } from "zod";

import { WorkflowCommandError } from "./helpers.js";

/** Parse commander raw opts; return schema *output* type (after coerce/default/preprocess). */
export function parseOpts<T extends ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
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
