import React from "react";
import { Box, Text } from "ink";
import type { DebugTrace } from "./debugTrace.js";

type Props = {
  trace: DebugTrace | null;
  visible?: boolean;
};

export function DebugPanel({ trace, visible = false }: Props) {
  if (!visible || !trace) return null;

  return (
    <Box flexDirection="column" marginY={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="magenta">Debug Trace</Text>
      <Text dimColor>mode={trace.taskMode} · {trace.routerReason}</Text>
      <Text dimColor>tools: {trace.activeTools.slice(0, 8).join(", ")}{trace.activeTools.length > 8 ? "…" : ""}</Text>
      <Text dimColor>
        termination={trace.termination.reason} · {trace.termination.totalTokens} tok · {trace.termination.wallClockMs}ms
      </Text>
      {trace.decisionTrace.map((line, i) => (
        <Text key={i} dimColor>{"  "}{line}</Text>
      ))}
      {trace.memoryEvents.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">Memory events</Text>
          {trace.memoryEvents.map((ev, i) => (
            <Text key={i} dimColor>{"  "}[{ev.type}] {ev.detail}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
