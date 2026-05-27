import type {
  AgentEvent,
  AgentConsoleViewModel,
  ChatStreamPart,
  ContextUsedSummary,
  InboxMessage,
  LearningItem,
  MarketIntentExplanation,
  PlaybookTheory,
  SignalDetail,
  SignalSummary,
  TodayFocusItem,
  ToolSetting,
  WatchlistItem,
} from "./adapter";
import fixtures from "./fixtures.json";

export type MockAgentConsoleFixture = AgentConsoleViewModel & {
  contextUsedByWorkstream: ContextUsedSummary[];
};

export const mockWatchlist = fixtures.mockWatchlist as WatchlistItem[];
export const mockSignals = fixtures.mockSignals as SignalDetail[];
export const mockMarketIntentExplanation = fixtures.mockMarketIntentExplanation as MarketIntentExplanation;
export const mockTodayFocusItems = fixtures.mockTodayFocusItems as TodayFocusItem[];
export const mockInboxMessages = fixtures.mockInboxMessages as InboxMessage[];
export const mockAgentEvents = fixtures.mockAgentEvents as AgentEvent[];
export const mockPlaybookTheories = fixtures.mockPlaybookTheories as PlaybookTheory[];
export const mockLearningItems = fixtures.mockLearningItems as LearningItem[];
export const mockToolSettings = fixtures.mockToolSettings as ToolSetting[];
export const mockChatStreamParts = fixtures.mockChatStreamParts as ChatStreamPart[];
export const mockAgentConsole = fixtures.mockAgentConsole as MockAgentConsoleFixture;
export const emptySignalList = fixtures.emptySignalList as SignalSummary[];
