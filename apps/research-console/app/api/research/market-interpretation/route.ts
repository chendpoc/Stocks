import { NextResponse } from "next/server";
import {
  isAuthorizedResearchConsoleRequest,
  researchConsoleForbiddenResponse,
} from "../../../../lib/api-auth";
import { inspectResearchContext } from "../../../../lib/context";
import { buildMarketInterpretation } from "../../../../lib/research-session";

type MarketInterpretationRequest = {
  day?: string;
};

export async function POST(request: Request) {
  if (!isAuthorizedResearchConsoleRequest(request)) {
    return researchConsoleForbiddenResponse();
  }

  const body = (await request.json().catch(() => ({}))) as MarketInterpretationRequest;
  try {
    const day = body.day || (await inspectResearchContext()).day;
    return NextResponse.json(await buildMarketInterpretation(day));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
