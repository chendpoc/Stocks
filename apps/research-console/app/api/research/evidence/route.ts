import { NextResponse } from "next/server";
import type { AgentToolTrace } from "@stock-summary/summary-core";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { executeResearchTool } from "../../../../lib/agent-tools";
import { inspectResearchContext, loadResearchContext } from "../../../../lib/context";
import {
  authorizeResearchTool,
  isResearchToolName,
} from "../../../../lib/tool-policy";
import { appendEvidenceRun, loadResearchSession } from "../../../../lib/research-session";

type EvidenceRequest = {
  day?: string;
  tool?: string;
  opportunityId?: string;
  symbol?: string;
  query?: string;
  period?: string;
};

function boundedText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeSymbol(value: unknown) {
  return boundedText(value, 32)
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "");
}

function normalizePeriod(value: unknown) {
  const period = boundedText(value, 12).toLowerCase();
  return /^\d+d$|^\d+mo$|^\d+y$|^ytd$|^max$/.test(period) ? period : "30d";
}

function traceFromPolicy(name: string, input: Record<string, string>, reason: string): AgentToolTrace {
  return {
    name,
    reason,
    input,
    result_summary: `${name} blocked: ${reason}`,
  };
}

function sourceTypeForTool(tool: string) {
  if (tool === "yfinance_history") return "history" as const;
  if (tool === "news_search") return "news" as const;
  return "quote" as const;
}

function verdictForTrace(trace: AgentToolTrace) {
  if (/blocked/i.test(trace.result_summary)) return "blocked" as const;
  if (/failed|skipped|unavailable/i.test(trace.result_summary)) return "neutral" as const;
  return "neutral" as const;
}

async function opportunityIdForRequest(day: string, body: EvidenceRequest) {
  if (body.opportunityId) return body.opportunityId;
  const symbol = normalizeSymbol(body.symbol);
  const session = await loadResearchSession(day);
  return session.opportunities.find((opportunity) => opportunity.symbols.includes(symbol))?.id
    ?? session.opportunities[0]?.id
    ?? "general";
}

function inputForTool(body: EvidenceRequest): Record<string, string> {
  const symbol = normalizeSymbol(body.symbol);
  const query = boundedText(body.query, 160);
  const period = normalizePeriod(body.period);

  if (body.tool === "news_search") {
    return { query: query || (symbol ? `${symbol} recent market news` : "") };
  }

  if (body.tool === "yfinance_history") {
    const input: Record<string, string> = { period };
    if (symbol) input.symbol = symbol;
    return input;
  }

  return symbol ? { symbol } : {};
}

export async function POST(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as EvidenceRequest;
  const day = body.day || (await inspectResearchContext()).day;
  const toolName = boundedText(body.tool, 80);
  const input = inputForTool({ ...body, tool: toolName });
  const policy = authorizeResearchTool(toolName);

  if (!isResearchToolName(toolName)) {
    return NextResponse.json(
      {
        policy,
        tool: traceFromPolicy(toolName || "unknown_tool", input, policy.reason),
      },
      { status: 400 },
    );
  }

  if (policy.status !== "allowed") {
    await appendEvidenceRun(day, {
      opportunityId: await opportunityIdForRequest(day, body),
      toolName,
      input,
      summary: `${toolName} blocked: ${policy.reason}`,
      verdict: "blocked",
      sourceType: sourceTypeForTool(toolName),
      fromCache: false,
    });
    return NextResponse.json({
      policy,
      tool: traceFromPolicy(toolName, input, policy.reason),
    });
  }

  try {
    const context = await loadResearchContext(day);
    const tool = await executeResearchTool({ name: toolName, input }, context);
    await appendEvidenceRun(day, {
      opportunityId: await opportunityIdForRequest(day, body),
      toolName,
      input,
      summary: tool.result_summary,
      verdict: verdictForTrace(tool),
      sourceType: sourceTypeForTool(toolName),
      fromCache: /\bcache\b/i.test(tool.result_summary),
    });
    return NextResponse.json({ policy, tool });
  } catch (error) {
    return NextResponse.json(
      {
        policy,
        tool: traceFromPolicy(
          toolName,
          input,
          error instanceof Error ? error.message : String(error),
        ),
      },
      { status: 400 },
    );
  }
}
