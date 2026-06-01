import React from "react";
import { Box, Text } from "ink";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { ActionBar, KeyHint, SelectableRow } from "../components/focus.js";
import { LessonDetailView } from "../components/LessonDetail.js";
import { useCachedFetch } from "../hooks/useCachedFetch.js";
import { useListDetailNav } from "../hooks/useListDetailNav.js";
import type { LessonRow } from "../types.js";

type LessonsResponse = { lessons?: LessonRow[] };

type Props = { isActive?: boolean; onOpenMenu: () => void };

export function LessonsPage({ isActive = true, onOpenMenu }: Props) {
  const { data, error, loading, loadingLabel, reload } = useCachedFetch<LessonsResponse>(
    "/lessons?limit=12",
    isActive,
    "加载 Lessons",
  );
  const lessons = data?.lessons ?? [];
  const { index, prevIndex, detail } = useListDetailNav({
    isActive,
    count: lessons.length,
    onReload: reload,
    onOpenMenu,
  });
  const selected = lessons[index];

  if (detail && selected) {
    return (
      <Box flexDirection="column" flexGrow={1} width="100%">
        <LessonDetailView lesson={selected} />
      </Box>
    );
  }

  const listPanel = (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Text bold color="cyan">
        Lessons
      </Text>
      <ActionBar>
        <KeyHint keys="↑↓" label="移动（·· 轨迹）" />
        <KeyHint keys="Enter" label="详情" />
        <KeyHint keys="r" label="刷新" dim />
      </ActionBar>
      <AsyncLoading active={loading} label={loadingLabel} />
      {!loading && error ? <Text color="red">{error}</Text> : null}
      {!loading && !error && lessons.length === 0 ? (
        <Text dimColor>无 lesson · [r] 手动刷新</Text>
      ) : null}
      {!loading && !error
        ? lessons.map((l, i) => (
          <SelectableRow
            key={l.lesson_id ?? `${l.symbol}-${i}`}
            index={i}
            focused={i === index}
            wasPrevious={prevIndex === i}
          >
            <Text color="yellow">{l.symbol ?? "—"}</Text>
            {l.confidence != null ? <Text dimColor> · conf={l.confidence}</Text> : null}
            <Text dimColor wrap="truncate">
              {" "}
              · {(l.summary ?? l.lesson_text ?? "").slice(0, 72)}
            </Text>
          </SelectableRow>
        ))
        : null}
    </Box>
  );

  return listPanel;
}
