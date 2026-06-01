import React from "react";
import { Box, Text } from "ink";
import { DetailFrame, DetailMetaGrid, DetailSection } from "./focus.js";
import type { LessonRow } from "../types.js";

export function LessonDetailView({ lesson }: { lesson: LessonRow }) {
  const headline = [lesson.symbol, lesson.verdict, lesson.market_regime]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailFrame title="Lesson 详情" subtitle="列表用 ↑↓ 移动 · ·· 显示上一光标位置">
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="yellow" underline>
          {headline || (lesson.lesson_id ?? "—")}
        </Text>
        {lesson.pattern_id ? (
          <Text dimColor>
            pattern: {lesson.pattern_id}
          </Text>
        ) : null}
      </Box>
      <DetailMetaGrid
        rows={[
          { label: "lesson_id", value: lesson.lesson_id ?? "—" },
          { label: "symbol", value: lesson.symbol ?? "—", highlight: true },
          { label: "ts", value: lesson.ts ?? "—" },
          ...(lesson.confidence != null
            ? [{ label: "confidence", value: String(lesson.confidence), highlight: true }]
            : []),
          ...(lesson.verdict
            ? [{ label: "verdict", value: lesson.verdict, highlight: true }]
            : []),
          ...(lesson.market_regime
            ? [{ label: "regime", value: lesson.market_regime }]
            : []),
        ]}
      />
      <DetailSection title="摘要" body={lesson.summary ?? ""} />
      <DetailSection title="Lesson 正文" body={lesson.lesson_text ?? ""} />
      <DetailSection title="规则 (rule)" body={lesson.rule_text ?? ""} />
      <DetailSection title="适用 (when_to_apply)" body={lesson.when_to_apply ?? ""} />
      <DetailSection title="不适用 (when_not_to_apply)" body={lesson.when_not_to_apply ?? ""} />
    </DetailFrame>
  );
}
