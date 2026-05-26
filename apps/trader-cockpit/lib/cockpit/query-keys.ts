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

export const cockpitKeys = {
  dashboard: (scope: DashboardScope) => ["cockpit", "dashboard", scope] as const,
  signals: (filters: SignalFilters = {}) => ["cockpit", "signals", filters] as const,
  signal: (id: string) => ["cockpit", "signal", id] as const,
  inbox: (filters: InboxFilters = {}) => ["cockpit", "inbox", filters] as const,
  agentEvents: (filters: AgentEventFilters = {}) => ["cockpit", "agent-events", filters] as const,
  playbookTheories: (filters: TheoryFilters = {}) => ["cockpit", "playbook-theories", filters] as const,
  learning: (filters: LearningFilters = {}) => ["cockpit", "learning", filters] as const,
  settings: () => ["cockpit", "settings"] as const,
  chat: (conversationId: string) => ["cockpit", "chat", conversationId] as const,
};
