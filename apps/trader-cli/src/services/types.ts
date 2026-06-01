export type ScanResult = {
  signals?: unknown[];
  scanned?: number;
  anomaly_dashboard?: Array<Record<string, unknown>>;
  pattern_alerts?: Array<Record<string, unknown>>;
  cross_asset?: {
    correlations?: Array<Record<string, unknown>>;
    anomalies?: unknown[];
  };
  [key: string]: unknown;
};

export type ReportResult = {
  hit: boolean;
  text: string;
  cachedAt?: string;
};

export type MarketStatusResult = {
  symbols?: Array<{
    symbol: string;
    latest_bar_ts: string | null;
    ingested_at: string | null;
  }>;
  symbol?: string;
  latest_bar_ts?: string | null;
  ingested_at?: string | null;
};

export type IngestSymbolResult = {
  status: string;
  symbol: string;
  daily: number;
  minute: number;
  force?: boolean;
};

export type ServerStatusResult = {
  ok: boolean;
  status?: string;
  intel_route_count?: number;
  error?: string;
};
