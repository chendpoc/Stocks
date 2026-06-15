import {
  type Stage1RunStatus,
  STAGE1_RUN_STATUSES,
} from "../runtime/checkpointStore.js";
import { isRunStatus, STAGE1_OBSERVABILITY_LIMIT_MAX } from "../runtime/stage1Runtime.js";
import {
  CLI_FLAG_CANDIDATE_ID,
  CLI_FLAG_CONFIRM,
  CLI_FLAG_FAILURE_TYPE,
  CLI_FLAG_GRAPH_NAME,
  CLI_FLAG_LIMIT,
  CLI_FLAG_PATTERN_ID,
  CLI_FLAG_PATTERN_MEMORY_ID,
  CLI_FLAG_PROFILE,
  CLI_FLAG_REASON,
  CLI_FLAG_SESSION_ID,
  CLI_FLAG_STATUS,
  CLI_FLAG_TYPE,
} from "../constants/cliFlags.js";
import {
  ERROR_CODE_CONFIRM_REQUIRED,
  ERROR_CODE_INVALID_OUTCOME_STATUS,
  ERROR_CODE_INVALID_STATUS,
  ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
  ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
} from "../constants/errorCodes.js";
import { OUTCOME_LIST_STATUSES, type OutcomeListStatus } from "../types/cli.js";
import { WorkflowCommandError } from "./helpers.js";

export const DEFAULT_OUTCOMES_LIST_LIMIT = 100;
export const DEFAULT_INSIGHTS_LIST_LIMIT = 50;

export function parseLimit(args: string[]): number {
  return parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, 50);
}

function isFlagValue(value: string): boolean {
  return value.startsWith("--");
}

function toFlagErrorCode(flag: string): string {
  return flag.replace(/^--/, "").toUpperCase().replace(/-/g, "_");
}

export function parseOptionalStatus(args: string[]): Stage1RunStatus | undefined {
  const raw = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  if (!raw) {
    return undefined;
  }
  if (!isRunStatus(raw)) {
    throw new WorkflowCommandError(
      ERROR_CODE_INVALID_STATUS,
      `status must be one of: ${STAGE1_RUN_STATUSES.join(", ")}`,
    );
  }
  return raw;
}

export function parseOptionalFlagValue(args: string[], flag: string): string | undefined {
  const flagIndex = args.indexOf(flag);
  if (flagIndex < 0) {
    return undefined;
  }
  const raw = args[flagIndex + 1];
  if (!raw || isFlagValue(raw)) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_VALUE_REQUIRED`,
      `${flag} requires a value`,
    );
  }
  return raw;
}

export function parseRequiredFlagValue(
  args: string[],
  flag: string,
  code: string,
  message: string,
): string {
  const value = parseOptionalFlagValue(args, flag);
  if (!value) {
    throw new WorkflowCommandError(code, message);
  }
  return value;
}

export function parseRequiredCsvFlag(args: string[], flag: string, code: string, message: string): string[] {
  const raw = parseRequiredFlagValue(args, flag, code, message);
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) {
    throw new WorkflowCommandError(code, message);
  }
  return values;
}

export function parseOptionalBooleanFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function parseOptionalOutcomeStatus(args: string[]): OutcomeListStatus | undefined {
  const raw = parseOptionalFlagValue(args, CLI_FLAG_STATUS);
  if (!raw) {
    return undefined;
  }
  if (!OUTCOME_LIST_STATUSES.includes(raw as OutcomeListStatus)) {
    throw new WorkflowCommandError(
      ERROR_CODE_INVALID_OUTCOME_STATUS,
      `${CLI_FLAG_STATUS} must be one of: ${OUTCOME_LIST_STATUSES.join(", ")}`,
    );
  }
  return raw as OutcomeListStatus;
}

export function parseOptionalGraphName(args: string[]): string | undefined {
  return parseOptionalFlagValue(args, CLI_FLAG_GRAPH_NAME);
}

export function parseRunObservabilityLimit(args: string[]): number {
  return Math.min(parseLimit(args), STAGE1_OBSERVABILITY_LIMIT_MAX);
}

export function parsePositiveIntegerFlag(
  args: string[],
  flag: string,
  defaultValue: number,
): number {
  const raw = parseOptionalFlagValue(args, flag);
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_INVALID`,
      `${flag} must be a positive integer`,
    );
  }
  return parsed;
}

export function parseOptionalIntFlag(args: string[], flag: string): number | undefined {
  const raw = parseOptionalFlagValue(args, flag);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowCommandError(
      `${toFlagErrorCode(flag)}_INVALID`,
      `${flag} must be a positive integer`,
    );
  }
  return parsed;
}

export function parseSessionIdOrProfile(args: string[]): string {
  return (
    parseOptionalFlagValue(args, CLI_FLAG_SESSION_ID) ??
    parseOptionalFlagValue(args, CLI_FLAG_PROFILE) ??
    "default"
  );
}

export function parseOptionalFailureType(args: string[]): string | undefined {
  return parseOptionalFlagValue(args, CLI_FLAG_TYPE) ?? parseOptionalFlagValue(args, CLI_FLAG_FAILURE_TYPE);
}

export function parsePatternMemoryPromoteInput(args: string[]): {
  pattern_memory_id?: string;
  candidate_id?: string;
} {
  if (!args.includes(CLI_FLAG_CONFIRM)) {
    throw new WorkflowCommandError(
      ERROR_CODE_CONFIRM_REQUIRED,
      "pattern-memory promote requires --confirm",
    );
  }
  const patternMemoryId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_MEMORY_ID);
  const candidateId = parseOptionalFlagValue(args, CLI_FLAG_CANDIDATE_ID);
  if (patternMemoryId && candidateId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
      "pattern-memory promote accepts either --pattern-memory-id or --candidate-id",
    );
  }
  if (!patternMemoryId && !candidateId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
      "pattern-memory promote requires --pattern-memory-id or --candidate-id",
    );
  }
  return { pattern_memory_id: patternMemoryId, candidate_id: candidateId };
}

export function parsePatternMemoryDegradeInput(args: string[]): {
  pattern_memory_id?: string;
  pattern_id?: string;
  reason?: string;
} {
  const patternMemoryId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_MEMORY_ID);
  const patternId = parseOptionalFlagValue(args, CLI_FLAG_PATTERN_ID);
  if (patternMemoryId && patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
      "pattern-memory degrade accepts either --pattern-memory-id or --pattern-id",
    );
  }
  const reason = parseOptionalFlagValue(args, CLI_FLAG_REASON);
  if (!patternMemoryId && !patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
      "pattern-memory degrade requires --pattern-memory-id or --pattern-id",
    );
  }
  return { pattern_memory_id: patternMemoryId, pattern_id: patternId, reason };
}

export function parsePositiveLimitFlag(args: string[], defaultLimit: number): number {
  return parsePositiveIntegerFlag(args, CLI_FLAG_LIMIT, defaultLimit);
}
