import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { PREFERRED_SYMBOLS } from "../../symbols.js";
import { PickerRow } from "./focus.js";
import { filterSymbolChoices, normalizeTicker } from "../symbolSearch.js";

type Props = {
  isActive: boolean;
  value: string;
  onChange: (symbol: string) => void;
  onClose: () => void;
};

export function SymbolPicker({ isActive, value, onChange, onClose }: Props) {
  const [query, setQuery] = useState(value);
  const [pickIndex, setPickIndex] = useState(0);
  const [prevPickIndex, setPrevPickIndex] = useState<number | null>(null);

  const choices = useMemo(() => filterSymbolChoices(query), [query]);

  useInput(
    (input, key) => {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.tab && choices.length > 0) {
        const sym = choices[pickIndex] ?? choices[0];
        if (sym) setQuery(sym);
        setPickIndex(0);
        return;
      }
      if (key.upArrow) {
        setPickIndex((i) => {
          const next = Math.max(0, i - 1);
          setPrevPickIndex(i);
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setPickIndex((i) => {
          const next = Math.min(choices.length - 1, i + 1);
          setPrevPickIndex(i);
          return next;
        });
      }
    },
    { isActive },
  );

  const commit = (raw: string) => {
    const sym = normalizeTicker(raw) ?? normalizeTicker(choices[pickIndex] ?? "");
    if (!sym) return;
    onChange(sym);
    onClose();
  };

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        选择标的
      </Text>
      <Text dimColor italic>
        输入代码 · Enter 确认 · 无数据时自动拉取 · [f] 强制刷新 · Esc 取消
      </Text>
      <Box>
        <Text color="cyan">{"> "}</Text>
        <TextInput
          value={query}
          onChange={(v) => {
            setQuery(v.toUpperCase());
            setPickIndex(0);
          }}
          onSubmit={commit}
          placeholder="如 TSLA、AAPL、BTC"
        />
      </Box>
      {choices.length === 0 ? (
        <Text dimColor>无匹配 · 输入 1–10 位字母数字代码后 Enter</Text>
      ) : (
        choices.map((sym, i) => (
          <PickerRow
            key={sym}
            label={sym}
            focused={i === pickIndex}
            wasPrevious={prevPickIndex === i}
            suffix={
              !(PREFERRED_SYMBOLS as readonly string[]).includes(sym) ? " (自定义)" : undefined
            }
          />
        ))
      )}
    </Box>
  );
}

type StripProps = {
  focusedSymbol: string;
  symbolMode?: boolean;
};

/** 未打开搜索时展示的 MVP 快选条 */
export function SymbolStrip({ focusedSymbol, symbolMode = false }: StripProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor italic>
        当前 <Text color="yellow" bold>{focusedSymbol}</Text>
        {symbolMode ? (
          <Text color="yellow" bold>
            {" "}
            · [x] 标的模式 · ←→ 切换
          </Text>
        ) : (
          <Text> · [x] 进入换标的 · [/] 搜代码 · [f] 拉行情</Text>
        )}
      </Text>
      <Box flexWrap="wrap">
        {PREFERRED_SYMBOLS.map((sym) => {
          const selected = sym === focusedSymbol;
          return (
            <Text key={sym} color={selected ? "yellow" : "gray"} bold={selected}>
              {selected ? `[${sym}]` : ` ${sym} `}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
