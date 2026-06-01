import React from "react";
import { Box, Text } from "ink";
import { MENU_HINTS, type MenuId } from "../menu.js";

type Props = { active: MenuId };

export function ContextHint({ active }: Props) {
  return (
    <Box paddingX={1}>
      <Text dimColor italic>
        {MENU_HINTS[active]}
      </Text>
    </Box>
  );
}
