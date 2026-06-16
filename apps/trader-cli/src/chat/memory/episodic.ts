import { safeFetchIntel } from "../../api/client.js";
import type { RetrievedMemory } from "../processedContext.js";

export type EpisodicReadResult =
  | { ok: true; data: RetrievedMemory }
  | { ok: false; blocked: string };

/**
 * Episodic read path — uses existing /lessons and /hypotheses APIs when available.
 */
export async function readEpisodicMemory(input: {
  symbol?: string;
  limit?: number;
}): Promise<EpisodicReadResult> {
  const limit = input.limit ?? 5;
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (input.symbol) params.set("symbol", input.symbol);

    const [lessons, hypotheses] = await Promise.all([
      safeFetchIntel(`/lessons?${params.toString()}`).catch(() => null),
      input.symbol
        ? safeFetchIntel(`/hypotheses?symbol=${encodeURIComponent(input.symbol)}&limit=${limit}`).catch(() => null)
        : Promise.resolve(null),
    ]);

    const lessonRows = Array.isArray(lessons) ? lessons : [];
    const hypothesisRows = Array.isArray(hypotheses) ? hypotheses : [];

    return {
      ok: true,
      data: {
        relatedDecisions: hypothesisRows as Array<Record<string, unknown>>,
        signalHistory: [],
        relevantNotes: lessonRows.map((row: Record<string, unknown>) =>
          String(row.summary ?? row.title ?? row.claim ?? JSON.stringify(row)).slice(0, 200),
        ),
      },
    };
  } catch (err) {
    return {
      ok: false,
      blocked: `Episodic read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
