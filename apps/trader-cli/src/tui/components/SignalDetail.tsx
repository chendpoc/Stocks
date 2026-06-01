import React from "react";
import { Box, Text } from "ink";
import { DetailFrame, DetailMetaGrid, DetailSection } from "./focus.js";
import type { SignalRow } from "../types.js";

export function SignalDetailView({ signal }: { signal: SignalRow }) {
  const headline = [signal.symbol, signal.signal_type, signal.status].filter(Boolean).join(" · ");

  return (
    <DetailFrame title="Signal 详情" subtitle="列表用 ↑↓ 移动 · ·· 显示上一光标位置">
      <Box marginBottom={1}>
        <Text bold color="yellow" underline>
          {headline || "—"}
        </Text>
        {signal.ts ? (
          <Text dimColor italic>
            {" "}
            @ {signal.ts}
          </Text>
        ) : null}
      </Box>
      <DetailMetaGrid
        rows={[
          { label: "signal_id", value: signal.signal_id ?? "—" },
          { label: "symbol", value: signal.symbol ?? "—", highlight: true },
          { label: "type", value: signal.signal_type ?? "—" },
          { label: "status", value: signal.status ?? "—", highlight: true },
          ...(signal.severity != null
            ? [{ label: "severity", value: String(signal.severity) }]
            : []),
        ]}
      />
      <DetailSection title="原始描述 (raw_description)" body={signal.raw_description ?? "（空）"} />
    </DetailFrame>
  );
}
