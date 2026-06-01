import React from "react";
import { Box } from "ink";
import type { MenuId } from "../menu.js";

type Props = {
  id: MenuId;
  active: MenuId;
  children: React.ReactNode;
};

/** 保持子树挂载，切换侧栏时不丢 React state */
export function PagePanel({ id, active, children }: Props) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      width="100%"
      display={active === id ? "flex" : "none"}
      overflow="hidden"
    >
      {children}
    </Box>
  );
}
