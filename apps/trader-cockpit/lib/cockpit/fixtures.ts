import type {
  AgentEvent,
  ChatStreamPart,
  InboxMessage,
  LearningItem,
  PlaybookTheory,
  SignalDetail,
  SignalSummary,
  ToolSetting,
  WatchlistItem,
} from "./adapter";
import fixtures from "./fixtures.json";

export const mockWatchlist = fixtures.mockWatchlist as WatchlistItem[];
export const mockSignals = fixtures.mockSignals as SignalDetail[];
export const mockInboxMessages = fixtures.mockInboxMessages as InboxMessage[];
export const mockAgentEvents = fixtures.mockAgentEvents as AgentEvent[];
export const mockPlaybookTheories = fixtures.mockPlaybookTheories as PlaybookTheory[];
export const mockLearningItems = fixtures.mockLearningItems as LearningItem[];
export const mockToolSettings = fixtures.mockToolSettings as ToolSetting[];
export const mockChatStreamParts = fixtures.mockChatStreamParts as ChatStreamPart[];
export const emptySignalList = fixtures.emptySignalList as SignalSummary[];
