type MarketDataSourceKind = "external" | "local-python" | "planned";

type MarketDataProviderDefinition = {
  name: string;
  source: MarketDataSourceKind;
  envKeys: string[];
  requiresSecret: boolean;
  notes: string;
};

export type MarketDataSourceStatus = {
  enabled: boolean;
  reason: "configured" | "missing-required-env" | "planned";
  configuredEnv?: string[];
  missingEnv?: string[];
};

export type MarketDataSource = {
  name: string;
  source: MarketDataSourceKind;
  status: MarketDataSourceStatus;
  requiresSecret: boolean;
  notes: string;
};

const PROVIDERS = [
  {
    name: "longbridge",
    source: "external",
    envKeys: ["LONGBRIDGE_APP_KEY", "LONGBRIDGE_APP_SECRET", "LONGBRIDGE_ACCESS_TOKEN"],
    requiresSecret: true,
    notes: "Longbridge quote capability is available only when server-side credentials are configured and external tools are explicitly enabled for execution.",
  },
  {
    name: "alpha-vantage",
    source: "external",
    envKeys: ["ALPHA_VANTAGE_API_KEY"],
    requiresSecret: true,
    notes: "Alpha Vantage quote capability is available only when its server-side API key is configured and external tools are explicitly enabled.",
  },
  {
    name: "news-search",
    source: "external",
    envKeys: ["NEWS_SEARCH_ENDPOINT", "NEWS_SEARCH_ALLOWED_HOSTS"],
    requiresSecret: false,
    notes: "News/web search is available only with an endpoint, an allowed-host list, and explicit external-tool opt-in.",
  },
  {
    name: "yfinance",
    source: "local-python",
    envKeys: [],
    requiresSecret: false,
    notes: "Local Python quote and history capability is available only when external tools are explicitly enabled for execution.",
  },
] satisfies MarketDataProviderDefinition[];

function hasConfiguredValue(env: Record<string, string | undefined>, key: string) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function buildStatus(
  provider: MarketDataProviderDefinition,
  env: Record<string, string | undefined>,
): MarketDataSourceStatus {
  if (provider.name === "yfinance") {
    const enabled = env.RESEARCH_ENABLE_EXTERNAL_TOOLS === "1";
    return {
      enabled,
      reason: enabled ? "configured" : "planned",
      configuredEnv: enabled ? ["RESEARCH_ENABLE_EXTERNAL_TOOLS"] : [],
      missingEnv: enabled ? [] : ["RESEARCH_ENABLE_EXTERNAL_TOOLS"],
    };
  }

  if (provider.source === "external") {
    const configured = provider.envKeys.filter((key) => hasConfiguredValue(env, key));
    const optInEnabled = env.RESEARCH_ENABLE_EXTERNAL_TOOLS === "1";
    const missingEnv = [
      ...provider.envKeys.filter((key) => !configured.includes(key)),
      ...(optInEnabled ? [] : ["RESEARCH_ENABLE_EXTERNAL_TOOLS"]),
    ];
    const enabled = configured.length === provider.envKeys.length && optInEnabled;

    return {
      enabled,
      reason: enabled ? "configured" : "missing-required-env",
      configuredEnv: configured,
      missingEnv,
    };
  }

  return {
    enabled: false,
    reason: "planned",
  };
}

export function listMarketDataSources(
  env: Record<string, string | undefined> = process.env,
): MarketDataSource[] {
  return PROVIDERS.map((provider) => ({
    name: provider.name,
    source: provider.source,
    status: buildStatus(provider, env),
    requiresSecret: provider.requiresSecret,
    notes: provider.notes,
  }));
}
