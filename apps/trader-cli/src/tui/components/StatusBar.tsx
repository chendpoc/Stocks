import React from "react";
import { Box, Text } from "ink";

type Props = {
  health: string;
  signalCount: number;
  backendHint?: string;
};

export function StatusBar({ health, signalCount, backendHint }: Props) {
  return (
    <Box borderStyle="single" paddingX={1} flexDirection="column">
      <Text>
        backend:{" "}
        <Text color={health === "ok" ? "green" : "yellow"}>{health}</Text>
        {"  |  "}
        signals: {signalCount}
      </Text>
      {backendHint ? (
        <Text dimColor italic>
          {backendHint}
        </Text>
      ) : null}
    </Box>
  );
}
