import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { getModel } from "../../llm/provider.js";
import { getAgentSystemPrompt, resolveAgentTools } from "../../llm/buildAgentTools.js";
import { chatReAct } from "../../llm/chatReAct.js";
import { MENU_KEYS, type MenuId } from "../menu.js";
import { getChatSuggestions } from "../chatSuggestions.js";
import { ActionBar, KeyHint, PickerRow } from "../components/focus.js";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { WorkflowStatusPanel } from "../components/WorkflowStatusPanel.js";
import type { ChatMessage } from "../types.js";
import type { WorkflowRun } from "../../llm/chatWorkflowRuns.js";

const MAX_HISTORY = 20;

type Props = {
  isActive: boolean;
  onNavigate: (id: MenuId) => void;
  onOpenMenu: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
};

export function ChatPage({ isActive, onNavigate, onOpenMenu, messages, setMessages }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeRuns, setActiveRuns] = useState<WorkflowRun[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [prevPickIndex, setPrevPickIndex] = useState<number | null>(null);

  const suggestions = useMemo(() => getChatSuggestions(input), [input]);
  const visibleSuggestions = suggestions.slice(0, 6);

  useInput(
    (inputKey, key) => {
      if (busy) return;
      if (key.escape || inputKey === "m") {
        onOpenMenu();
        return;
      }
      if (key.ctrl && MENU_KEYS[inputKey]) {
        onNavigate(MENU_KEYS[inputKey]);
        setInput("");
        return;
      }
      if (key.tab && visibleSuggestions.length > 0) {
        const next = visibleSuggestions[pickIndex] ?? visibleSuggestions[0];
        if (next) {
          setInput(next);
          setPickIndex((pickIndex + 1) % visibleSuggestions.length);
        }
        return;
      }
      if (key.upArrow && visibleSuggestions.length > 0) {
        setPickIndex((i) => {
          const next = Math.max(0, i - 1);
          setPrevPickIndex(i);
          return next;
        });
        return;
      }
      if (key.downArrow && visibleSuggestions.length > 0) {
        setPickIndex((i) => {
          const next = Math.min(visibleSuggestions.length - 1, i + 1);
          setPrevPickIndex(i);
          return next;
        });
      }
    },
    { isActive },
  );

  const handleChange = (value: string) => {
    if (busy) return;
    setInput(value);
    setPickIndex(0);
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    const userMsg: ChatMessage = { role: "user", content: value };
    const next: ChatMessage[] = [...messages, userMsg].slice(-MAX_HISTORY);
    setMessages(next);
    setInput("");
    setPickIndex(0);

    try {
      const tools = await resolveAgentTools();
      const system = await getAgentSystemPrompt();
      const result = await chatReAct({
        model: getModel(),
        system,
        messages: next,
        tools,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: result.terminatedBy !== "natural"
          ? `${result.text}\n[终止: ${result.terminatedBy} · ${result.totalTokens} tok · ${result.wallClockMs}ms]`
          : result.text,
      };
      setMessages([...next, assistantMsg].slice(-MAX_HISTORY));

      if (result.workflowRuns.length > 0) {
        setActiveRuns((prev) => [...prev, ...result.workflowRuns]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const errMsg: ChatMessage = { role: "assistant", content: `错误: ${msg}` };
      setMessages([...next, errMsg].slice(-MAX_HISTORY));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">
        Agent Chat（{messages.length} 条 · 保留 {MAX_HISTORY} 轮）
      </Text>
      <Text dimColor italic>
        任意 ticker · Tab 补全 · Esc / m → 菜单 · Ctrl+1-7 切页
      </Text>
      {messages.length === 0 && !busy ? (
        <Text dimColor>开始输入问题，或 Tab 选建议命令</Text>
      ) : (
        messages.map((m, i) => (
          <Box key={`${i}-${m.role}`} flexDirection="column">
            <Text color={m.role === "user" ? "cyan" : "white"}>
              {m.role === "user" ? "> " : "← "}
              {m.content.slice(0, 500)}
              {m.content.length > 500 ? "…" : ""}
            </Text>
          </Box>
        ))
      )}
      <AsyncLoading
        active={busy}
        label="Agent 思考中"
        hint="正在调用 LLM / tools，请稍候"
      />
      <WorkflowStatusPanel runs={activeRuns} />
      {visibleSuggestions.length > 0 && !busy ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="double"
          borderColor="yellow"
          paddingX={1}
        >
          <ActionBar>
            <KeyHint keys="Tab" label="填入" />
            <KeyHint keys="↑↓" label="移动（·· 上一位置）" />
          </ActionBar>
          {visibleSuggestions.map((s, i) => (
            <PickerRow
              key={s}
              label={s}
              focused={i === pickIndex}
              wasPrevious={prevPickIndex === i}
            />
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={busy ? "yellow" : undefined}>{busy ? "◌ " : "> "}</Text>
        <TextInput
          value={input}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={busy ? "等待回复…" : "输入消息或 /命令、标的代码"}
        />
      </Box>
    </Box>
  );
}
