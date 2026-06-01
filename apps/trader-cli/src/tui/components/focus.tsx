import React from "react";
import { Box, Text } from "ink";

type SelectableRowProps = {
  index: number;
  focused: boolean;
  wasPrevious?: boolean;
  children: React.ReactNode;
};

/** 列表行：仅 ▸▸ / ·· 标记，不用边框（避免与详情区双框） */
export function SelectableRow({ index, focused, wasPrevious, children }: SelectableRowProps) {
  const marker = focused ? "▸▸" : wasPrevious ? "··" : "  ";
  const markerColor = focused ? "yellow" : wasPrevious ? "cyan" : "gray";

  return (
    <Text bold={focused} color={focused ? "yellow" : wasPrevious ? "cyan" : undefined}>
      <Text color={markerColor} bold={focused}>
        {marker}
      </Text>
      <Text dimColor={!focused && !wasPrevious}>
        {" "}
        {String(index + 1).padStart(2, "0")}{" "}
      </Text>
      {children}
    </Text>
  );
}

type PickerRowProps = {
  label: string;
  focused: boolean;
  wasPrevious?: boolean;
  suffix?: string;
};

/** 搜索列表行（SymbolPicker / Chat 建议） */
export function PickerRow({ label, focused, wasPrevious, suffix }: PickerRowProps) {
  const marker = focused ? "▸▸" : wasPrevious ? "··" : "  ";
  return (
    <Text bold={focused} color={focused ? "yellow" : wasPrevious ? "cyan" : undefined}>
      <Text color={focused ? "yellow" : wasPrevious ? "cyan" : "gray"} bold={focused}>
        {marker}
      </Text>
      {` ${label}`}
      {suffix ? <Text dimColor>{suffix}</Text> : null}
      {focused ? <Text color="yellow"> ◂</Text> : null}
    </Text>
  );
}

type FieldRowProps = {
  label: string;
  value: string;
  highlight?: boolean;
};

export function FieldRow({ label, value, highlight }: FieldRowProps) {
  return (
    <Box marginLeft={1}>
      <Text dimColor>{label}: </Text>
      <Text color={highlight ? "yellow" : "white"} bold={highlight} wrap="wrap">
        {value}
      </Text>
    </Box>
  );
}

type SectionProps = {
  title: string;
  body: string;
};

export function DetailSection({ title, body }: SectionProps) {
  if (!body.trim()) return null;
  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1}>
      <Text bold color="cyan">
        ┌ {title}
      </Text>
      <Text wrap="wrap" color="white">
        {body}
      </Text>
    </Box>
  );
}

type DetailFrameProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function DetailFrame({ title, subtitle, children }: DetailFrameProps) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="double" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        ▸▸ {title}
      </Text>
      <ActionBar>
        <KeyHint keys="Esc" label="返回" />
        <KeyHint keys="b" label="返回" dim />
        <KeyHint keys="r" label="刷新列表" dim />
      </ActionBar>
      <Text dimColor italic>
        {subtitle}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

type MetaGridProps = {
  rows: Array<{ label: string; value: string; highlight?: boolean }>;
};

export function DetailMetaGrid({ rows }: MetaGridProps) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">
        ── 元数据
      </Text>
      {rows.map((r) => (
        <FieldRow key={r.label} label={r.label} value={r.value} highlight={r.highlight} />
      ))}
    </Box>
  );
}

type KeyHintProps = {
  keys: string;
  label: string;
  dim?: boolean;
};

/** 底部/行内快捷键：键名高亮 */
export function KeyHint({ keys, label, dim }: KeyHintProps) {
  return (
    <Text>
      <Text bold color={dim ? "gray" : "yellow"} inverse={!dim}>
        {" "}
        {keys}
        {" "}
      </Text>
      <Text dimColor={dim} color={dim ? undefined : "white"} bold={!dim}>
        {label}
      </Text>
    </Text>
  );
}

export function ActionBar({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      marginY={1}
      borderStyle="single"
      borderColor="yellow"
      paddingX={1}
    >
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Text dimColor> · </Text> : null}
          {child}
        </React.Fragment>
      ))}
    </Box>
  );
}
