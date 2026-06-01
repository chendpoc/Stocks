import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  MARKET_DATA_PROVIDER_OPTIONS,
  getMarketDataProvider,
  hasAlphaVantageApiKey,
  marketDataProviderWarning,
  setMarketDataProvider,
  type MarketDataProviderId,
} from "../../services/marketDataProvider.js";
import { probeLongbridge } from "../../services/longbridge.js";
import {
  getLongbridgeAgentSetting,
  getLongbridgeBootstrapWarning,
  setLongbridgeAgentSetting,
  tryEnableLongbridgeAgent,
  type LongbridgeAgentMode,
} from "../../services/longbridgeAgent.js";
import { ActionBar, KeyHint, SelectableRow } from "../components/focus.js";

const READONLY_KEYS = [
  "TRADER_API_BASE",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "ALPHAVANTAGE_API_KEY",
  "TRADER_LONGBRIDGE_AGENT",
] as const;

const LONGBRIDGE_AGENT_OPTIONS = [
  {
    id: "on" as const,
    label: "on · Chat Agent 注册长桥 CLI 工具（只读）",
    hint: "客观行情优先长桥；需 PATH 中 longbridge 且已 auth login",
  },
  {
    id: "off" as const,
    label: "off · 仅 Dashboard [l]/[L] 外挂",
    hint: "不向 Agent 注册长桥工具；ingest 仍走 MARKET_DATA_PROVIDER",
  },
];

type SettingsSection = "market" | "longbridge";

type Props = { isActive?: boolean };

export function SettingsPage({ isActive = true }: Props) {
  const marketOptions = useMemo(() => [...MARKET_DATA_PROVIDER_OPTIONS], []);
  const [section, setSection] = useState<SettingsSection>("market");
  const [currentMarket, setCurrentMarket] = useState<MarketDataProviderId>(() =>
    getMarketDataProvider(),
  );
  const [marketPickIndex, setMarketPickIndex] = useState(() =>
    Math.max(0, marketOptions.findIndex((o) => o.id === getMarketDataProvider())),
  );
  const [prevMarketPick, setPrevMarketPick] = useState<number | null>(null);

  const [currentLb, setCurrentLb] = useState<LongbridgeAgentMode>(() =>
    getLongbridgeAgentSetting(),
  );
  const [lbPickIndex, setLbPickIndex] = useState(() =>
    currentLb === "on" ? 0 : 1,
  );
  const [prevLbPick, setPrevLbPick] = useState<number | null>(null);
  const [lbProbeLine, setLbProbeLine] = useState("");
  const [statusLine, setStatusLine] = useState("");
  const bootstrapWarn = getLongbridgeBootstrapWarning();

  const refreshLbProbe = useCallback(async () => {
    const probe = await probeLongbridge();
    if (!probe.installed) {
      setLbProbeLine("CLI: 未安装");
      return;
    }
    if (!probe.authOk) {
      setLbProbeLine(`CLI: 未登录 · ${probe.message.slice(0, 80)}`);
      return;
    }
    setLbProbeLine(`CLI: 就绪 · ${probe.cliPath ?? "longbridge"}`);
  }, []);

  useEffect(() => {
    if (isActive) void refreshLbProbe();
  }, [isActive, currentLb, refreshLbProbe]);

  const applyMarket = useCallback((id: MarketDataProviderId) => {
    setMarketDataProvider(id);
    setCurrentMarket(id);
    const warn = marketDataProviderWarning(id);
    setStatusLine(
      warn
        ? `行情源 → ${id} · ${warn}`
        : `行情源 → ${id} · 重启 trader-agent 后 ingest 生效`,
    );
  }, []);

  const applyLongbridge = useCallback(async (id: LongbridgeAgentMode) => {
    if (id === "off") {
      setLongbridgeAgentSetting("off");
      setCurrentLb("off");
      setLbPickIndex(1);
      setStatusLine("Longbridge Agent → off");
      await refreshLbProbe();
      return;
    }
    const result = await tryEnableLongbridgeAgent();
    if (!result.ok) {
      setLongbridgeAgentSetting("off");
      setCurrentLb("off");
      setLbPickIndex(1);
      setStatusLine(result.message);
      await refreshLbProbe();
      return;
    }
    setCurrentLb("on");
    setLbPickIndex(0);
    setStatusLine(result.message);
    await refreshLbProbe();
  }, [refreshLbProbe]);

  useInput(
    (_input, key) => {
      if (key.tab) {
        setSection((s) => (s === "market" ? "longbridge" : "market"));
        setStatusLine("");
        return;
      }
      if (section === "market") {
        if (key.upArrow) {
          setMarketPickIndex((i) => {
            const next = Math.max(0, i - 1);
            setPrevMarketPick(i);
            return next;
          });
          return;
        }
        if (key.downArrow) {
          setMarketPickIndex((i) => {
            const next = Math.min(marketOptions.length - 1, i + 1);
            setPrevMarketPick(i);
            return next;
          });
          return;
        }
        if (key.return) {
          const opt = marketOptions[marketPickIndex];
          if (opt) applyMarket(opt.id);
        }
        return;
      }
      if (key.upArrow) {
        setLbPickIndex((i) => {
          const next = Math.max(0, i - 1);
          setPrevLbPick(i);
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setLbPickIndex((i) => {
          const next = Math.min(LONGBRIDGE_AGENT_OPTIONS.length - 1, i + 1);
          setPrevLbPick(i);
          return next;
        });
        return;
      }
      if (key.return) {
        const opt = LONGBRIDGE_AGENT_OPTIONS[lbPickIndex];
        if (opt) void applyLongbridge(opt.id);
      }
    },
    { isActive },
  );

  const avKey = hasAlphaVantageApiKey();
  const activeWarn = marketDataProviderWarning(currentMarket);
  const lbFocused = section === "longbridge";
  const marketFocused = section === "market";

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold color="cyan">
        Settings
      </Text>
      <Text dimColor italic>
        Tab 切换区块 · ↑↓ 选择 · Enter 保存到仓库根 .env
      </Text>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor={marketFocused ? "yellow" : "gray"}
        paddingX={1}
      >
        <Text bold color={marketFocused ? "yellow" : "gray"}>
          MARKET_DATA_PROVIDER {marketFocused ? "◀" : ""}
        </Text>
        <Text dimColor>
          当前: <Text color="green">{currentMarket}</Text>
          {avKey ? " · AV Key 已配置" : " · AV Key 未配置"}
        </Text>
        {marketOptions.map((opt, i) => (
          <Box key={opt.id} flexDirection="column" marginTop={i === 0 ? 1 : 0}>
            <SelectableRow
              index={i}
              focused={marketFocused && i === marketPickIndex}
              wasPrevious={prevMarketPick === i}
            >
              <Text>{opt.label}</Text>
            </SelectableRow>
            {marketFocused && i === marketPickIndex ? (
              <Text dimColor italic>
                {"    "}
                {opt.hint}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor={lbFocused ? "yellow" : "gray"}
        paddingX={1}
      >
        <Text bold color={lbFocused ? "yellow" : "gray"}>
          TRADER_LONGBRIDGE_AGENT {lbFocused ? "◀" : ""}
        </Text>
        <Text dimColor>
          当前: <Text color="green">{currentLb}</Text>
          {lbProbeLine ? ` · ${lbProbeLine}` : null}
        </Text>
        {LONGBRIDGE_AGENT_OPTIONS.map((opt, i) => (
          <Box key={opt.id} flexDirection="column" marginTop={i === 0 ? 1 : 0}>
            <SelectableRow
              index={i}
              focused={lbFocused && i === lbPickIndex}
              wasPrevious={prevLbPick === i}
            >
              <Text>{opt.label}</Text>
            </SelectableRow>
            {lbFocused && i === lbPickIndex ? (
              <Text dimColor italic>
                {"    "}
                {opt.hint}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>

      {bootstrapWarn ? (
        <Box marginTop={1}>
          <Text color="red">{bootstrapWarn}</Text>
        </Box>
      ) : null}
      {activeWarn ? (
        <Box marginTop={1}>
          <Text color="red">{activeWarn}</Text>
        </Box>
      ) : null}
      {statusLine ? (
        <Box marginTop={1}>
          <Text color="cyan" wrap="truncate">
            {statusLine}
          </Text>
        </Box>
      ) : null}
      <ActionBar>
        <KeyHint keys="Tab" label="切换区块" />
        <KeyHint keys="↑↓" label="选择" />
        <KeyHint keys="Enter" label="写入 .env" />
      </ActionBar>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          其它环境变量（只读）
        </Text>
        {READONLY_KEYS.map((key) => {
          const raw = process.env[key];
          const display =
            raw == null || raw === ""
              ? "(unset)"
              : key.includes("KEY")
                ? "***"
                : raw;
          return (
            <Text key={key}>
              <Text color="yellow">{key}</Text>
              <Text dimColor>=</Text>
              {display}
            </Text>
          );
        })}
        <Text dimColor italic>
          LLM 等: trader config set KEY VALUE（同样写入 .env）
        </Text>
      </Box>
    </Box>
  );
}
