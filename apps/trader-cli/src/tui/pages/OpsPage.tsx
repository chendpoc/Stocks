import React, { useCallback, useState } from "react";
import { Box, Text, useInput } from "ink";
import { getMarketStatus, ingestMarket } from "../../services/market.js";
import { ingestNews } from "../../services/news.js";
import { getServerStatus, startServer, stopServer } from "../../services/server.js";
import { AsyncLoading } from "../components/AsyncLoading.js";
import { ActionBar, KeyHint } from "../components/focus.js";

type Props = { isActive?: boolean };

export function OpsPage({ isActive = true }: Props) {
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [serverLine, setServerLine] = useState("按 [R] 刷新 status（不自动请求）");
  const [marketLine, setMarketLine] = useState("—");
  const [lastAction, setLastAction] = useState("");

  const refreshStatus = useCallback(async (label = "刷新 status") => {
    setBusyLabel(label);
    try {
      const s = await getServerStatus();
      if (s.ok) {
        setServerLine(`ok · intel routes ${s.intel_route_count ?? "?"}`);
      } else {
        setServerLine(`offline · ${s.error ?? s.status ?? "?"}`);
      }
      const m = await getMarketStatus();
      const withBars = m.symbols.filter((x) => x.latest_bar_ts).length;
      setMarketLine(`${withBars}/${m.symbols.length} 标的已有日线`);
    } catch (e: unknown) {
      setMarketLine(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyLabel(null);
    }
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (busyLabel) return;
    setBusyLabel(label);
    setLastAction("");
    try {
      const out = await fn();
      setLastAction(`${label}: ${JSON.stringify(out).slice(0, 120)}`);
      await refreshStatus("刷新 status");
    } catch (e: unknown) {
      setLastAction(`${label} 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useInput(
    (input, key) => {
      if (busyLabel) return;
      const ch = input.toLowerCase();
      if (ch === "s") {
        startServer();
        setLastAction("已发送 start（请稍后 [r] 刷新 status）");
        return;
      }
      if (ch === "x") {
        void run("停止后端", async () => {
          await stopServer();
          return { stopped: true };
        });
        return;
      }
      if (ch === "i") {
        void run("行情 ingest", ingestMarket);
        return;
      }
      if (ch === "n") {
        void run("新闻 ingest", ingestNews);
        return;
      }
      if (ch === "r" || key.return) {
        void refreshStatus().then(() => setLastAction("status 已刷新"));
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">
        Ops
      </Text>
      <ActionBar>
        <KeyHint keys="S" label="start" />
        <KeyHint keys="X" label="stop" />
        <KeyHint keys="I" label="ingest 行情" />
        <KeyHint keys="N" label="ingest 新闻" />
        <KeyHint keys="R" label="刷新 status" />
      </ActionBar>
      <Text dimColor italic>
        进入本页不自动请求 · [R] 手动刷新 status
      </Text>
      <AsyncLoading active={Boolean(busyLabel)} label={busyLabel ?? "处理中"} />
      <Text>
        Server: <Text color={serverLine.startsWith("ok") ? "green" : "red"}>{serverLine}</Text>
      </Text>
      <Text>Market: {marketLine}</Text>
      {lastAction ? (
        <Text dimColor wrap="truncate">
          {lastAction}
        </Text>
      ) : null}
    </Box>
  );
}
