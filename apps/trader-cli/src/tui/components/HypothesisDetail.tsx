import React from "react";
import { DetailFrame, DetailMetaGrid, DetailSection } from "./focus.js";
import type { HypothesisRow } from "../types.js";

export function HypothesisDetailView({ row }: { row: HypothesisRow }) {
  return (
    <DetailFrame title="Hypothesis 详情" subtitle="列表用 ↑↓ 移动 · ·· 显示上一光标位置">
      <DetailMetaGrid
        rows={[
          { label: "hypothesis_id", value: row.hypothesis_id ?? "—" },
          { label: "signal_id", value: row.signal_id ?? "—" },
          { label: "symbol", value: row.symbol ?? "—", highlight: true },
          { label: "status", value: row.status ?? "—" },
          ...(row.confidence != null
            ? [{ label: "confidence", value: String(row.confidence), highlight: true }]
            : []),
          ...(row.tradability
            ? [{ label: "tradability", value: row.tradability }]
            : []),
        ]}
      />
      <DetailSection title="Claim" body={row.claim ?? ""} />
      <DetailSection title="专业解释" body={row.professional_explanation ?? ""} />
      <DetailSection title="白话解释" body={row.plain_language_explanation ?? ""} />
      <DetailSection title="失效条件" body={row.invalidation_condition ?? ""} />
    </DetailFrame>
  );
}
