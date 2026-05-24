import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { listAgentRunEvidence } from "../../../../lib/agent-evidence";
import { inspectResearchContext } from "../../../../lib/context";

function parseLimit(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const url = new URL(request.url);
  const requestedDay = url.searchParams.get("day") || undefined;
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const day = requestedDay ?? (await inspectResearchContext()).day;
    return NextResponse.json(await listAgentRunEvidence(day, { limit }));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
