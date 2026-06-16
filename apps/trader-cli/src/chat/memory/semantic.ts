import type { RetrievedMemory } from "../processedContext.js";

export type SemanticReadResult =
  | { ok: true; data: Pick<RetrievedMemory, "relevantNotes"> }
  | { ok: false; blocked: string };

/**
 * Semantic retrieval facade — corpus search only; no vector-store invention.
 */
export async function readSemanticMemory(input: {
  query: string;
  symbol?: string;
  limit?: number;
  searchCorpus?: (query: string, symbol?: string, limit?: number) => Promise<unknown>;
}): Promise<SemanticReadResult> {
  if (!input.searchCorpus) {
    return {
      ok: false,
      blocked: "Semantic retrieval requires searchCorpus adapter (no vector store in v1)",
    };
  }

  try {
    const raw = await input.searchCorpus(input.query, input.symbol, input.limit ?? 5);
    const rows = Array.isArray(raw) ? raw : [];
    return {
      ok: true,
      data: {
        relevantNotes: rows.map((row: Record<string, unknown>) =>
          String(row.snippet ?? row.text ?? row.title ?? JSON.stringify(row)).slice(0, 200),
        ),
      },
    };
  } catch (err) {
    return {
      ok: false,
      blocked: `Semantic read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
