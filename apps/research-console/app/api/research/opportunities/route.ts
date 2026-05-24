import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { loadOpportunityBoard } from "../../../../lib/opportunity-board";

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const url = new URL(request.url);
  const day = url.searchParams.get("day") || undefined;

  try {
    return NextResponse.json(await loadOpportunityBoard(day));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
