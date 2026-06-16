import React from "react";
import { Box, Text } from "ink";
import type { StepTrace } from "../../llm/chatReAct.js";

type Props = {
  steps: StepTrace[];
  active: boolean;
};

export function ThinkingPanel({ steps, active }: Props) {
  if (steps.length === 0) return null;

  const last = steps[steps.length - 1];
  if (!last) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="yellow">
          {active ? "💭 Thinking..." : "💭 Done"} [{last.step}]
        </Text>
        <Text dimColor>
          {" "}
          {last.elapsedMs}ms · {(last.tokensUsed / 1000).toFixed(1)}K tok
        </Text>
      </Box>
      <Text dimColor>{last.thought.slice(0, 120)}</Text>
      {last.actions.map((action, i) => (
        <Text key={`${last.step}-${i}`} color="cyan">
          {"  "}✓ {action}
        </Text>
      ))}
      {last.observations ? (
        <Text color="green">{"  "}← {last.observations.slice(0, 100)}</Text>
      ) : null}
    </Box>
  );
}
