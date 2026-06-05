import type { ContextSnapshotRecord } from "../../services/contextSnapshots.js";

export interface EvidenceRef {
  ref_type: string;
  ref_id: string;
  symbol?: string;
}

export function extractEvidenceRefs(
  snapshot: ContextSnapshotRecord | null | undefined,
): EvidenceRef[] {
  if (!snapshot) {
    return [];
  }
  if (Array.isArray(snapshot.evidence_refs_json)) {
    return snapshot.evidence_refs_json as EvidenceRef[];
  }
  const fromItems = (snapshot.items_json ?? [])
    .map((item) => item.evidence_ref)
    .filter((ref): ref is EvidenceRef => Boolean(ref?.ref_type && ref?.ref_id));
  return fromItems;
}
