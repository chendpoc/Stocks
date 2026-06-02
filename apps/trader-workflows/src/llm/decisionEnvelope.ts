export const DECISION_ACTIONS = [
  "NO_TRADE",
  "WATCH",
  "WAIT_TRIGGER",
  "PAPER_ENTER_CANDIDATE",
  "PAPER_EXIT_CANDIDATE",
  "INVALIDATE",
] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export interface DecisionEnvelope {
  symbol: string;
  action: DecisionAction;
  thesis: string;
  confidence: number;
  uncertainty?: number;
  watch_condition?: string;
  trigger?: string;
  invalidation?: string;
  target_plan?: string;
  exit_rationale?: string;
  hold_condition?: string;
}

export class DecisionEnvelopeValidationError extends Error {
  readonly code = "INVALID_DECISION_ENVELOPE";

  constructor(message: string) {
    super(message);
  }
}

function isDecisionAction(value: unknown): value is DecisionAction {
  return (
    typeof value === "string" &&
    (DECISION_ACTIONS as readonly string[]).includes(value)
  );
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DecisionEnvelopeValidationError(`${field} is required`);
  }
  return value.trim();
}

/** Normalize LLM probability fields to [0, 1] (handles 0-100 percentages). */
export function normalizeProbability(
  value: unknown,
  options: { optional?: boolean; field: string },
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  let candidate: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "low") {
      return 0.25;
    }
    if (trimmed === "medium" || trimmed === "moderate") {
      return 0.5;
    }
    if (trimmed === "high") {
      return 0.75;
    }
    candidate = trimmed;
  }

  let n = Number(candidate);
  if (!Number.isFinite(n)) {
    if (options.optional) {
      return undefined;
    }
    throw new DecisionEnvelopeValidationError(
      `${options.field} must be a number between 0 and 1`,
    );
  }

  // Integer 2–100 likely means a percentage (e.g. 35 → 0.35); keep decimals like 1.2 as overflow.
  if (Number.isInteger(n) && n > 1 && n <= 100) {
    n /= 100;
  }

  if (n < 0) {
    n = 0;
  } else if (n > 1) {
    n = 1;
  }

  return n;
}

function pickString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/** Map common LLM field aliases before action-specific validation. */
function coalescePlanFields(record: Record<string, unknown>): {
  watch_condition?: string;
  trigger?: string;
  invalidation?: string;
  target_plan?: string;
  exit_rationale?: string;
  hold_condition?: string;
} {
  const plan =
    typeof record.plan === "object" && record.plan !== null && !Array.isArray(record.plan)
      ? (record.plan as Record<string, unknown>)
      : undefined;

  return {
    watch_condition: pickString(record, [
      "watch_condition",
      "watchCondition",
      "watch_criteria",
      "watchCriteria",
      "condition",
      "criteria",
    ]) ?? (plan ? pickString(plan, ["watch_condition", "watchCondition", "condition"]) : undefined),
    trigger: pickString(record, [
      "trigger",
      "entry_trigger",
      "entryTrigger",
      "trigger_condition",
      "triggerCondition",
    ]) ?? (plan ? pickString(plan, ["trigger", "entry_trigger"]) : undefined),
    invalidation: pickString(record, [
      "invalidation",
      "invalidate_condition",
      "invalidateCondition",
      "stop_condition",
      "stopCondition",
    ]) ?? (plan ? pickString(plan, ["invalidation", "stop"]) : undefined),
    target_plan: pickString(record, [
      "target_plan",
      "targetPlan",
      "target",
      "take_profit",
      "takeProfit",
    ]) ?? (plan ? pickString(plan, ["target_plan", "target"]) : undefined),
    exit_rationale: pickString(record, [
      "exit_rationale",
      "exitRationale",
      "exit_reason",
      "exitReason",
    ]),
    hold_condition: pickString(record, [
      "hold_condition",
      "holdCondition",
      "hold_rationale",
      "holdRationale",
    ]),
  };
}

function normalizeAction(value: unknown): DecisionAction | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return isDecisionAction(normalized) ? normalized : null;
}

export function parseDecisionEnvelope(raw: unknown): DecisionEnvelope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DecisionEnvelopeValidationError("DecisionEnvelope must be an object");
  }
  const record = raw as Record<string, unknown>;
  const symbol = requireNonEmpty(record.symbol, "symbol").toUpperCase();
  const action = normalizeAction(record.action);
  if (!action) {
    throw new DecisionEnvelopeValidationError(
      `action must be one of ${DECISION_ACTIONS.join(", ")}`,
    );
  }
  const thesis = requireNonEmpty(record.thesis, "thesis");
  const confidence = normalizeProbability(record.confidence, {
    optional: false,
    field: "confidence",
  });
  if (confidence === undefined) {
    throw new DecisionEnvelopeValidationError("confidence must be between 0 and 1");
  }
  const uncertainty = normalizeProbability(record.uncertainty, {
    optional: true,
    field: "uncertainty",
  });
  const planFields = coalescePlanFields(record);

  const envelope: DecisionEnvelope = {
    symbol,
    action,
    thesis,
    confidence,
    uncertainty,
    watch_condition: planFields.watch_condition,
    trigger: planFields.trigger,
    invalidation: planFields.invalidation,
    target_plan: planFields.target_plan,
    exit_rationale: planFields.exit_rationale,
    hold_condition: planFields.hold_condition,
  };

  validateDecisionEnvelope(envelope);
  return envelope;
}

export function validateDecisionEnvelope(envelope: DecisionEnvelope): void {
  switch (envelope.action) {
    case "NO_TRADE":
      return;
    case "WATCH":
      requireNonEmpty(envelope.watch_condition, "watch_condition");
      return;
    case "WAIT_TRIGGER":
      requireNonEmpty(envelope.trigger, "trigger");
      requireNonEmpty(envelope.invalidation, "invalidation");
      return;
    case "PAPER_ENTER_CANDIDATE":
      requireNonEmpty(envelope.trigger, "trigger");
      requireNonEmpty(envelope.invalidation, "invalidation");
      requireNonEmpty(envelope.target_plan, "target_plan");
      return;
    case "PAPER_EXIT_CANDIDATE":
      requireNonEmpty(envelope.exit_rationale, "exit_rationale");
      if (!envelope.invalidation && !envelope.hold_condition) {
        throw new DecisionEnvelopeValidationError(
          "invalidation or hold_condition is required for PAPER_EXIT_CANDIDATE",
        );
      }
      return;
    case "INVALIDATE":
      requireNonEmpty(envelope.invalidation, "invalidation");
      return;
    default:
      throw new DecisionEnvelopeValidationError(`unsupported action: ${envelope.action}`);
  }
}

export function extractDecisionJson(envelope: DecisionEnvelope): Record<string, unknown> {
  return {
    symbol: envelope.symbol,
    action: envelope.action,
    thesis: envelope.thesis,
    confidence: envelope.confidence,
    uncertainty: envelope.uncertainty ?? null,
    watch_condition: envelope.watch_condition ?? null,
    trigger: envelope.trigger ?? null,
    invalidation: envelope.invalidation ?? null,
    target_plan: envelope.target_plan ?? null,
    exit_rationale: envelope.exit_rationale ?? null,
    hold_condition: envelope.hold_condition ?? null,
    paper_execution_submitted: false,
  };
}
