import React from "react";
import { Box, Text } from "ink";
import { SpinnerLine } from "./SpinnerLine.js";

type Props = {
  active: boolean;
  label: string;
  hint?: string;
};

/** 异步任务进行中的统一 loading 展示 */
export function AsyncLoading({ active, label, hint }: Props) {
  if (!active) return null;
  return (
    <Box flexDirection="column" marginY={1}>
      <SpinnerLine active label={label} />
      {hint ? (
        <Text dimColor italic>
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}
