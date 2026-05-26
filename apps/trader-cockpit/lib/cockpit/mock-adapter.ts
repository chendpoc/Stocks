import type {
  AgentEventInput,
  AgentEventListViewModel,
  ChatStreamInput,
  ChatStreamPart,
  CockpitDataAdapter,
  InboxInput,
  InboxMessageListViewModel,
  LearningInput,
  LearningItemListViewModel,
  PlaybookTheoryListViewModel,
  SignalDetail,
  SignalDetailInput,
  SignalListInput,
  SignalListViewModel,
  TheoryListInput,
  TodayFocusItem,
  TodayFocusListInput,
  TodayFocusListViewModel,
  ToolSettingsViewModel,
} from "./adapter";
import {
  mockAgentEvents,
  mockChatStreamParts,
  mockInboxMessages,
  mockLearningItems,
  mockMarketIntentExplanation,
  mockPlaybookTheories,
  mockSignals,
  mockTodayFocusItems,
  mockToolSettings,
  mockWatchlist,
} from "./fixtures";

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The chat stream was stopped.", "AbortError"));
      return;
    }

    const timeoutId = globalThis.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeoutId);
        reject(new DOMException("The chat stream was stopped.", "AbortError"));
      },
      { once: true },
    );
  });
}

function filterSignals(input?: SignalListInput): SignalDetail[] {
  return mockSignals.filter((signal) => {
    const statusMatch = !input?.status || input.status === "all" || signal.status === input.status;
    const symbolMatch = !input?.symbol || signal.symbol === input.symbol;
    return statusMatch && symbolMatch;
  });
}

function matchesTodayFocusQuery(item: TodayFocusItem, query?: string): boolean {
  const normalizedQuery = query?.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [item.title, item.summary, item.reason, item.symbol ?? "", ...item.tags].some((value) => {
    return value.toLowerCase().includes(normalizedQuery);
  });
}

function filterTodayFocusItems(input?: TodayFocusListInput): TodayFocusItem[] {
  return mockTodayFocusItems.filter((item) => {
    const queryMatch = matchesTodayFocusQuery(item, input?.query);
    const typeMatch = !input?.type || item.type === input.type;
    const statusMatch = !input?.status || item.status === input.status;
    return queryMatch && typeMatch && statusMatch;
  });
}

export const mockCockpitAdapter: CockpitDataAdapter = {
  async listSignals(input?: SignalListInput): Promise<SignalListViewModel> {
    return {
      signals: filterSignals(input),
      watchlist: mockWatchlist,
    };
  },

  async getMarketIntentExplanation() {
    return {
      explanation: mockMarketIntentExplanation,
    };
  },

  async listTodayFocus(input?: TodayFocusListInput): Promise<TodayFocusListViewModel> {
    const filteredItems = filterTodayFocusItems(input);
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, input?.pageSize ?? 6);
    const startIndex = (page - 1) * pageSize;

    return {
      items: filteredItems.slice(startIndex, startIndex + pageSize),
      total: filteredItems.length,
      page,
      pageSize,
    };
  },

  async getSignal(input: SignalDetailInput): Promise<SignalDetail> {
    const signal = mockSignals.find((item) => item.id === input.id);
    if (!signal) {
      throw new Error(`Signal not found: ${input.id}`);
    }

    return signal;
  },

  async listInboxMessages(input?: InboxInput): Promise<InboxMessageListViewModel> {
    const messages = mockInboxMessages.filter((message) => {
      return !input?.priority || input.priority === "all" || message.priority === input.priority;
    });

    return { messages };
  },

  async listAgentEvents(input?: AgentEventInput): Promise<AgentEventListViewModel> {
    const events = mockAgentEvents.filter((event) => {
      return !input?.scope || input.scope === "all" || event.runId.includes(input.scope);
    });

    return { events };
  },

  async listPlaybookTheories(input?: TheoryListInput): Promise<PlaybookTheoryListViewModel> {
    const theories = mockPlaybookTheories.filter((theory) => {
      const statusMatch = !input?.status || input.status === "all" || theory.status === input.status;
      const tagMatch = !input?.tag || input.tag === "all" || theory.tags.includes(input.tag);
      return statusMatch && tagMatch;
    });

    return { theories };
  },

  async listLearningItems(input?: LearningInput): Promise<LearningItemListViewModel> {
    const items = mockLearningItems.filter((item) => {
      return !input?.type || input.type === "all" || item.type === input.type;
    });

    return {
      items,
      hasMeaningfulNewLearning: items.length > 0,
    };
  },

  async getToolSettings(): Promise<ToolSettingsViewModel> {
    return {
      tools: mockToolSettings,
      localPreferences: {
        pollingIntervalSeconds: 60,
        density: "compact",
        chartTimeframe: "5m",
      },
    };
  },

  async *streamChat(input: ChatStreamInput): AsyncIterable<ChatStreamPart> {
    for (const part of mockChatStreamParts) {
      await wait(160, input.signal);
      yield part;
    }
  },
};
