import React from "react";
import { Box, Text } from "ink";
import type { MenuId } from "../menu.js";
import type { ViewMode } from "../menu.js";
import { KeyHint } from "./focus.js";

type Props = {
  viewMode: ViewMode;
  onChat?: boolean;
  activeMenu?: MenuId;
};

export function HotkeyBar({ viewMode, onChat, activeMenu }: Props) {
  if (viewMode === "menu") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="Enter" label="进入内容区" />
        <Text dimColor> · </Text>
        <KeyHint keys="1-8" label="直达" />
        <Text dimColor> · [q] 退出</Text>
      </Box>
    );
  }

  if (onChat) {
    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <KeyHint keys="Tab" label="补全" />
        <Text dimColor> · </Text>
        <KeyHint keys="Esc" label="返回菜单" />
        <Text dimColor> · </Text>
        <KeyHint keys="m" label="菜单" dim />
        <Text dimColor> · </Text>
        <KeyHint keys="Ctrl+1-8" label="切页" />
        <Text dimColor> · [q] 退出</Text>
      </Box>
    );
  }

  if (activeMenu === "dashboard") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="x" label="换标的" />
        <KeyHint keys="[]" label="周期" />
        <KeyHint keys="↑↓" label="滚日报" dim />
        <KeyHint keys="f" label="拉行情" />
        <KeyHint keys="g" label="日报" />
        <Text dimColor> · [q] 退出</Text>
      </Box>
    );
  }

  if (activeMenu === "watchlist") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="↑↓" label="选择" />
        <KeyHint keys="Enter" label="详情" />
        <KeyHint keys="←→" label="切标签" dim />
        <KeyHint keys="r" label="刷新" dim />
        <KeyHint keys="Esc" label="菜单" dim />
      </Box>
    );
  }

  if (activeMenu === "ops") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="S" label="start" />
        <KeyHint keys="X" label="stop" />
        <KeyHint keys="I" label="ingest" />
        <KeyHint keys="N" label="news" />
        <KeyHint keys="R" label="status" />
        <KeyHint keys="Esc" label="菜单" dim />
      </Box>
    );
  }

  if (activeMenu === "settings") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="↑↓" label="数据源模式" />
        <KeyHint keys="Enter" label="保存 .env" />
        <Text dimColor> · </Text>
        <KeyHint keys="Esc" label="菜单" dim />
        <Text dimColor> · [q] 退出</Text>
      </Box>
    );
  }

  if (activeMenu === "hypotheses" || activeMenu === "lessons" || activeMenu === "signals") {
    return (
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <KeyHint keys="↑↓" label="光标" />
        <KeyHint keys="Enter" label="详情" />
        <KeyHint keys="r" label="刷新" dim />
        <Text dimColor> · </Text>
        <KeyHint keys="Esc" label="菜单" dim />
        <Text dimColor> · [q] 退出</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <KeyHint keys="Esc" label="返回菜单" />
      <Text dimColor> · </Text>
      <KeyHint keys="m" label="菜单" dim />
      <Text dimColor> · </Text>
      <KeyHint keys="Ctrl+1-8" label="切页" />
      <Text dimColor> · [q] 退出</Text>
    </Box>
  );
}
