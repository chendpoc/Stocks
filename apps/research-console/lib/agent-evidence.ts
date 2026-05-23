import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentChatMessage,
  AgentRunEvidenceList,
  AgentRunEvidenceSummary,
  AgentResponseEnvelope,
  ResearchContextSummary,
} from "@stock-summary/summary-core";

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 6000;
const DROPPED_KEYS = new Set([
  "opportunityMarkdown",
  "raw_markdown",
  "raw_json",
  "structuredPath",
  "authorization",
  "headers",
]);

function workspaceRoot() {
  return process.env.STOCK_SUMMARY_ROOT
    ? path.resolve(process.env.STOCK_SUMMARY_ROOT)
    : path.resolve(process.cwd(), "../..");
}

function logRelativePath(day: string) {
  return `.cache/research-agent/runs/${day}.jsonl`;
}

function logAbsolutePath(day: string) {
  return path.join(workspaceRoot(), ".cache", "research-agent", "runs", `${day}.jsonl`);
}

function secretValues() {
  return Object.entries(process.env)
    .filter(([key, value]) =>
      value &&
      value.length >= 8 &&
      /(KEY|TOKEN|SECRET|WEBHOOK|AUTHORIZATION|PASSWORD)/i.test(key),
    )
    .map(([, value]) => value as string);
}

function redactString(value: string, root: string, secrets: string[]) {
  let result = value.replaceAll(root, "[workspace]");
  for (const secret of secrets) {
    result = result.replaceAll(secret, REDACTED);
  }
  return result.slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: unknown, root: string, secrets: string[]): unknown {
  if (typeof value === "string") return redactString(value, root, secrets);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, root, secrets));
  if (!value || typeof value !== "object") return undefined;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      if (DROPPED_KEYS.has(key) || DROPPED_KEYS.has(key.toLowerCase())) return [];
      const sanitized = sanitizeValue(child, root, secrets);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }),
  );
}

function buildRunId() {
  return `run_${crypto.randomBytes(8).toString("hex")}`;
}

function validateDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid agent run evidence date: ${day}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseEvidenceLine(line: string) {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanPreview(value: unknown, root: string, secrets: string[], maxLength = 500) {
  const filtered = asString(value)
    .split(/\r?\n/)
    .filter((line) => !/(raw_markdown|raw_json|opportunityMarkdown|Authorization|Bearer)/i.test(line))
    .join("\n");

  return redactString(filtered, root, secrets)
    .slice(0, maxLength);
}

function cleanIdentifier(value: unknown, root: string, secrets: string[]) {
  return redactString(asString(value), root, secrets)
    .replace(/\[redacted\]/gi, "")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-z0-9_.$:-]/g, "")
    .slice(0, 80);
}

function summarizeEvidenceRecord(
  record: Record<string, unknown>,
  evidence_log_path: string,
  root: string,
  secrets: string[],
): AgentRunEvidenceSummary {
  const toolTrace = Array.isArray(record.tool_trace) ? record.tool_trace : [];
  const policyDecisions = Array.isArray(record.policy_decisions) ? record.policy_decisions : [];
  const opportunityReasoning = asRecord(record.opportunity_reasoning);
  const candidates = Array.isArray(opportunityReasoning.candidateOpportunities)
    ? opportunityReasoning.candidateOpportunities
    : [];

  return {
    run_id: asString(record.run_id),
    created_at: asString(record.created_at),
    day: asString(record.day),
    provider: record.provider === "openai-compatible" ? "openai-compatible" : "local-deterministic",
    provider_status: record.provider_status === "ready" || record.provider_status === "error"
      ? record.provider_status
      : "fallback",
    message_preview: cleanPreview(record.message_preview, root, secrets),
    answer_preview: cleanPreview(record.answer_preview, root, secrets, 800),
    tool_names: toolTrace.flatMap((tool) => {
      const name = cleanIdentifier(asRecord(tool).name, root, secrets);
      return name ? [name] : [];
    }),
    blocked_tools: policyDecisions.flatMap((decision) => {
      const entry = asRecord(decision);
      const name = cleanIdentifier(entry.name, root, secrets);
      return entry.status === "blocked" && name ? [name] : [];
    }),
    candidate_symbols: candidates.flatMap((candidate) => {
      const symbol = cleanIdentifier(asRecord(candidate).symbol, root, secrets);
      return symbol ? [symbol] : [];
    }),
    evidence_log_path,
  };
}

export async function persistAgentRunEvidence(input: {
  day: string;
  message: string;
  messages?: AgentChatMessage[];
  context: ResearchContextSummary;
  response: Omit<AgentResponseEnvelope, "run_id" | "evidence_log_path">;
}): Promise<Pick<AgentResponseEnvelope, "run_id" | "evidence_log_path">> {
  validateDay(input.day);
  const root = workspaceRoot();
  const run_id = buildRunId();
  const evidence_log_path = logRelativePath(input.day);
  const record = {
    schema_version: 1,
    run_id,
    created_at: new Date().toISOString(),
    day: input.day,
    message_preview: input.message.slice(0, 500),
    message_count: input.messages?.length ?? 0,
    context_counts: {
      event_summary: input.context.eventSummary.length,
      overview: input.context.overview.length,
      admin_core: input.context.adminCore.length,
      admin_symbols: input.context.adminSymbols.length,
      risks: input.context.risks.length,
    },
    answer_preview: input.response.answer.slice(0, 1200),
    reasoning_summary: input.response.reasoning_summary,
    next_watch_plan: input.response.next_watch_plan,
    conversation_summary: input.response.conversation_summary,
    provider: input.response.provider,
    provider_status: input.response.provider_status,
    used_context: input.response.used_context,
    tool_trace: input.response.tool_trace,
    policy_decisions: input.response.policy_decisions,
    opportunity_reasoning: input.response.opportunity_reasoning,
  };
  const sanitized = sanitizeValue(record, root, secretValues());
  const logPath = logAbsolutePath(input.day);

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(sanitized)}\n`, "utf8");

  return { run_id, evidence_log_path };
}

export async function listAgentRunEvidence(
  day: string,
  options: { limit?: number } = {},
): Promise<AgentRunEvidenceList> {
  validateDay(day);
  const root = workspaceRoot();
  const secrets = secretValues();
  const evidence_log_path = logRelativePath(day);
  const logPath = logAbsolutePath(day);
  const raw = await fs.readFile(logPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const runs = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseEvidenceLine)
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .reverse()
    .slice(0, limit)
    .map((record) => summarizeEvidenceRecord(record, evidence_log_path, root, secrets));

  return {
    day,
    evidence_log_path,
    runs,
  };
}
