import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { loadOpportunityBoard } from "../../../../lib/opportunity-board";

function latestBeijingDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const url = new URL(request.url);
  const day = url.searchParams.get("day") || latestBeijingDay();

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
