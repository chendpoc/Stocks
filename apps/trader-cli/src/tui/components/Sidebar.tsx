import React from "react";
import { Box, Text } from "ink";
import { MENU_ITEMS, type MenuId } from "../menu.js";
import { ActionBar, KeyHint } from "./focus.js";

type Props = {
  active: MenuId;
  focusIndex: number;
  prevFocusIndex?: number | null;
  /** 独占终端时的全屏菜单布局 */
  fullScreen?: boolean;
};

export function Sidebar({ active, focusIndex, prevFocusIndex, fullScreen }: Props) {
  const menuList = (
    <Box flexDirection="column">
      {MENU_ITEMS.map((item, i) => {
        const focused = i === focusIndex;
        const wasPrev = prevFocusIndex === i;
        const marker = focused ? "▸▸" : wasPrev ? "··" : "  ";
        return (
          <Text
            key={item.id}
            color={focused ? "yellow" : wasPrev ? "cyan" : undefined}
            bold={focused}
            underline={focused}
          >
            <Text color={focused ? "yellow" : wasPrev ? "cyan" : "gray"}>{marker}</Text>
            {i + 1}. {item.label}
            {item.id === active && !focused ? <Text dimColor> · 上次</Text> : null}
          </Text>
        );
      })}
    </Box>
  );

  if (!fullScreen) {
    return (
      <Box flexDirection="column" width={22} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">
          Trader
        </Text>
        {menuList}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        Trader CLI
      </Text>
      <Text dimColor italic>
        选择功能后 Enter 进入全屏内容区（侧栏不再同屏显示）
      </Text>
      <Box marginTop={1} flexDirection="column">
        {menuList}
      </Box>
      <Box marginTop={2}>
        <ActionBar>
          <KeyHint keys="↑↓" label="移动" />
          <KeyHint keys="Enter" label="进入" />
          <KeyHint keys="1-7" label="直达" />
        </ActionBar>
      </Box>
    </Box>
  );
}
