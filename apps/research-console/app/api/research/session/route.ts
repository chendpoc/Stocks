import { NextResponse } from "next/server";
import type { SessionStatus } from "@stock-summary/summary-core";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { loadResearchSession, patchResearchSession } from "../../../../lib/research-session";

type SessionRequest = {
  day?: string;
  status?: string;
};

const SESSION_STATUSES = new Set<SessionStatus>([
  "draft",
  "context_loaded",
  "opportunity_generated",
  "evidence_enriched",
  "watching",
  "reviewed",
]);

function dayFromRequest(request: Request, body?: SessionRequest) {
  const url = new URL(request.url);
  return body?.day || url.searchParams.get("day") || undefined;
}

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  try {
    return NextResponse.json(await loadResearchSession(dayFromRequest(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as SessionRequest;
  try {
    return NextResponse.json(await loadResearchSession(dayFromRequest(request, body)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as SessionRequest;
  if (body.status && !SESSION_STATUSES.has(body.status as SessionStatus)) {
    return NextResponse.json({ error: `Invalid session status: ${body.status}` }, { status: 400 });
  }

  try {
    return NextResponse.json(await patchResearchSession(dayFromRequest(request, body), {
      status: body.status as SessionStatus | undefined,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
