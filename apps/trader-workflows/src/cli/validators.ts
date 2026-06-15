import {
  ERROR_CODE_CONFIRM_REQUIRED,
  ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
  ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
} from "../constants/errorCodes.js";
import { WorkflowCommandError } from "./helpers.js";

export type PatternMemoryPromoteInput = {
  pattern_memory_id?: string;
  candidate_id?: string;
};

export type PatternMemoryDegradeInput = {
  pattern_memory_id?: string;
  pattern_id?: string;
  reason?: string;
};

export function validatePatternMemoryPromoteInput(opts: {
  confirm?: boolean;
  patternMemoryId?: string;
  candidateId?: string;
}): PatternMemoryPromoteInput {
  if (!opts.confirm) {
    throw new WorkflowCommandError(
      ERROR_CODE_CONFIRM_REQUIRED,
      "pattern-memory promote requires --confirm",
    );
  }
  const patternMemoryId = opts.patternMemoryId;
  const candidateId = opts.candidateId;
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

export function validatePatternMemoryDegradeInput(opts: {
  patternMemoryId?: string;
  patternId?: string;
  reason?: string;
}): PatternMemoryDegradeInput {
  const patternMemoryId = opts.patternMemoryId;
  const patternId = opts.patternId;
  if (patternMemoryId && patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_MUTUALLY_EXCLUSIVE,
      "pattern-memory degrade accepts either --pattern-memory-id or --pattern-id",
    );
  }
  if (!patternMemoryId && !patternId) {
    throw new WorkflowCommandError(
      ERROR_CODE_PATTERN_IDENTIFIER_REQUIRED,
      "pattern-memory degrade requires --pattern-memory-id or --pattern-id",
    );
  }
  return {
    pattern_memory_id: patternMemoryId,
    pattern_id: patternId,
    reason: opts.reason,
  };
}
