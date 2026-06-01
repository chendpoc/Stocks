import React from "react";
import { Box, Text } from "ink";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { ActionBar, KeyHint, SelectableRow } from "../components/focus.js";
import { HypothesisDetailView } from "../components/HypothesisDetail.js";
import { useCachedFetch } from "../hooks/useCachedFetch.js";
import { useListDetailNav } from "../hooks/useListDetailNav.js";
import type { HypothesisRow } from "../types.js";

type HypothesesResponse = { hypotheses?: HypothesisRow[] };

type Props = { isActive?: boolean; onOpenMenu: () => void };

export function HypothesesPage({ isActive = true, onOpenMenu }: Props) {
  const { data, error, loading, loadingLabel, reload } = useCachedFetch<HypothesesResponse>(
    "/hypotheses?limit=15",
    isActive,
    "加载 Hypotheses",
  );
  const rows = data?.hypotheses ?? [];
  const { index, prevIndex, detail } = useListDetailNav({
    isActive,
    count: rows.length,
    onReload: reload,
    onOpenMenu,
  });
  const selected = rows[index];

  if (detail && selected) {
    return (
      <Box flexDirection="column" flexGrow={1} width="100%">
        <HypothesisDetailView row={selected} />
      </Box>
    );
  }

  const listPanel = (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Text bold color="cyan">
        Hypotheses
      </Text>
      <ActionBar>
        <KeyHint keys="↑↓" label="移动（·· 轨迹）" />
        <KeyHint keys="Enter" label="详情" />
        <KeyHint keys="r" label="刷新" dim />
      </ActionBar>
      <AsyncLoading active={loading} label={loadingLabel} />
      {!loading && error ? <Text color="red">{error}</Text> : null}
      {!loading && !error && rows.length === 0 ? (
        <Text dimColor>无假设 · [r] 手动刷新</Text>
      ) : null}
      {!loading && !error
        ? rows.map((h, i) => (
          <SelectableRow
            key={h.hypothesis_id ?? `${h.symbol}-${i}`}
            index={i}
            focused={i === index}
            wasPrevious={prevIndex === i}
          >
            <Text color="yellow">{h.symbol ?? "—"}</Text>
            {h.confidence != null ? <Text> · conf={h.confidence}</Text> : null}
            {h.status ? <Text dimColor> · {h.status}</Text> : null}
            <Text dimColor wrap="truncate">
              {" "}
              · {(h.claim ?? "").slice(0, 72)}
            </Text>
          </SelectableRow>
        ))
        : null}
    </Box>
  );

  return listPanel;
}
