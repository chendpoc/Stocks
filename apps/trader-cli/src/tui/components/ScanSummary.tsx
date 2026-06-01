import React from "react";
import { Box, Text } from "ink";
import type { ScanResult } from "../../services/types.js";

type Props = { scan: ScanResult | null; compact?: boolean };

export function ScanSummary({ scan, compact }: Props) {
  if (!scan) {
    return <Text dimColor>按 [s] 运行 scan</Text>;
  }
  const patterns = scan.pattern_alerts ?? [];
  const correlations = scan.cross_asset?.correlations ?? [];
  const anomalies = scan.anomaly_dashboard ?? [];
  const signalList = Array.isArray(scan.signals) ? scan.signals : [];

  if (compact) {
    return (
      <Text dimColor>
        scan: 信号 {signalList.length} · pattern {patterns.length} · cross{" "}
        {correlations.length} · anomaly {anomalies.length}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Scan · 信号 <Text bold>{signalList.length}</Text> · pattern{" "}
        <Text bold>{patterns.length}</Text> · cross <Text bold>{correlations.length}</Text>
      </Text>
      {patterns.slice(0, 3).map((p, i) => (
        <Text key={`p-${i}`} dimColor wrap="truncate">
          pattern: {String(p.pattern_id ?? p.symbol ?? JSON.stringify(p)).slice(0, 60)}
        </Text>
      ))}
      {correlations.slice(0, 2).map((c, i) => (
        <Text key={`c-${i}`} dimColor wrap="truncate">
          cross: {String(c.pair ?? c.symbol_a ?? JSON.stringify(c)).slice(0, 60)}
        </Text>
      ))}
    </Box>
  );
}
