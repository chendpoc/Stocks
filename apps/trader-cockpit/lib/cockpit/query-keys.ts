export type DashboardScope = {
  session: "live" | "pre-market" | "after-hours";
};

export type SignalFilters = {
  status?: string;
  symbol?: string;
};

export type InboxFilters = {
  priority?: string;
};

export type AgentEventFilters = {
  scope?: string;
};

export type TheoryFilters = {
  status?: string;
  tag?: string;
};

export type LearningFilters = {
  type?: string;
};

export type TodayFocusFilters = {
  query?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type AgentConsoleFilters = {
  workstreamId?: string;
};

export const cockpitKeys = {
  dashboard: (scope: DashboardScope) => ["cockpit", "dashboard", scope] as const,
  marketIntentExplanation: () => ["cockpit", "market-intent-explanation"] as const,
  todayFocus: (filters: TodayFocusFilters = {}) => ["cockpit", "today-focus", filters] as const,
  signals: (filters: SignalFilters = {}) => ["cockpit", "signals", filters] as const,
  signal: (id: string) => ["cockpit", "signal", id] as const,
  inbox: (filters: InboxFilters = {}) => ["cockpit", "inbox", filters] as const,
  agentEvents: (filters: AgentEventFilters = {}) => ["cockpit", "agent-events", filters] as const,
  playbookTheories: (filters: TheoryFilters = {}) => ["cockpit", "playbook-theories", filters] as const,
  learning: (filters: LearningFilters = {}) => ["cockpit", "learning", filters] as const,
  settings: () => ["cockpit", "settings"] as const,
  chat: (conversationId: string) => ["cockpit", "chat", conversationId] as const,
  agentConsole: (filters: AgentConsoleFilters = {}) => ["cockpit", "agent-console", filters] as const,
};
