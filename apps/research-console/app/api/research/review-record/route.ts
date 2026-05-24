import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { inspectResearchContext } from "../../../../lib/context";
import { appendReviewRecord, loadResearchSession } from "../../../../lib/research-session";

type ReviewRequest = {
  day?: string;
  opportunityId?: string;
  outcome?: "validated" | "failed" | "unclear";
  observedMove?: string;
  failureReason?: string;
  learning?: string;
};

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const url = new URL(request.url);
  const day = url.searchParams.get("day") || (await inspectResearchContext()).day;
  try {
    const session = await loadResearchSession(day);
    return NextResponse.json({ day, reviewRecords: session.reviewRecords });
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

  const body = (await request.json().catch(() => ({}))) as ReviewRequest;
  const day = body.day || (await inspectResearchContext()).day;
  if (!body.opportunityId || !body.outcome || !body.observedMove || !body.learning) {
    return NextResponse.json(
      { error: "Review record requires opportunityId, outcome, observedMove, and learning." },
      { status: 400 },
    );
  }

  try {
    const reviewRecord = await appendReviewRecord(day, {
      opportunityId: body.opportunityId,
      outcome: body.outcome,
      observedMove: body.observedMove,
      failureReason: body.failureReason,
      learning: body.learning,
    });
    return NextResponse.json({ reviewRecord });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
