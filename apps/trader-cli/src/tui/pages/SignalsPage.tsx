import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { runScan } from "../../services/scan.js";
import type { ScanResult } from "../../services/types.js";
import { ActionBar, KeyHint, SelectableRow } from "../components/focus.js";
import { SignalDetailView } from "../components/SignalDetail.js";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { ScanSummary } from "../components/ScanSummary.js";
import { useCachedFetch } from "../hooks/useCachedFetch.js";
import { useListDetailNav } from "../hooks/useListDetailNav.js";
import type { SignalRow } from "../types.js";

type SignalsResponse = { signals?: SignalRow[] };

type Props = {
  isActive?: boolean;
  onOpenMenu: () => void;
  lastScan: ScanResult | null;
  setLastScan: React.Dispatch<React.SetStateAction<ScanResult | null>>;
};

export function SignalsPage({ isActive = true, onOpenMenu, lastScan, setLastScan }: Props) {
  const { data, error, loading, loadingLabel, reload } = useCachedFetch<SignalsResponse>(
    "/signals?limit=20",
    isActive,
    "加载信号列表",
  );
  const [busy, setBusy] = useState(false);
  const signals = data?.signals ?? [];
  const { index, prevIndex, detail } = useListDetailNav({
    isActive,
    count: signals.length,
    onReload: reload,
    onOpenMenu,
  });
  const selected = signals[index];

  useInput(
    (input) => {
      if (detail) return;
      if (input === "s" && !busy && !loading) {
        setBusy(true);
        void runScan()
          .then(setLastScan)
          .finally(() => setBusy(false));
      }
    },
    { isActive },
  );

  if (detail && selected) {
    return (
      <Box flexDirection="column" flexGrow={1} width="100%">
        <SignalDetailView signal={selected} />
      </Box>
    );
  }

  const listPanel = (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Text bold color="cyan">
        Signals
      </Text>
      <ActionBar>
        <KeyHint keys="↑↓" label="移动（·· 轨迹）" />
        <KeyHint keys="Enter" label="详情" />
        <KeyHint keys="s" label="scan" />
        <KeyHint keys="r" label="刷新" dim />
      </ActionBar>
      <AsyncLoading active={busy} label="信号 scan" />
      {!detail ? <ScanSummary scan={lastScan} /> : null}
      <AsyncLoading active={loading} label={loadingLabel} />
      {!loading && error ? <Text color="red">{error}</Text> : null}
      {!loading && !error && signals.length === 0 ? (
        <Text dimColor>无信号 · [s] scan 或 [r] 刷新</Text>
      ) : null}
      {!loading && !error
        ? signals.map((s, i) => (
          <SelectableRow
            key={s.signal_id ?? `${s.symbol}-${s.ts}`}
            index={i}
            focused={i === index}
            wasPrevious={prevIndex === i}
          >
            <Text color="yellow">{s.symbol}</Text>
            <Text> · {s.signal_type}</Text>
            <Text dimColor> · {s.status}</Text>
            <Text dimColor wrap="truncate">
              {" "}
              · {(s.raw_description ?? "").slice(0, 72)}
            </Text>
          </SelectableRow>
        ))
        : null}
    </Box>
  );

  return listPanel;
}
