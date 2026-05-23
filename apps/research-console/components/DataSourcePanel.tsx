"use client";

import { useEffect, useMemo, useState } from "react";

type DataSource = {
  name: string;
  source: "external" | "local-python" | "planned";
  requiresSecret: boolean;
  notes: string;
  status: {
    enabled: boolean;
    reason: "configured" | "missing-required-env" | "planned";
    configuredEnv?: string[];
    missingEnv?: string[];
  };
};

function sourceLabel(source: DataSource["source"]) {
  if (source === "local-python") return "local python";
  return source;
}

function statusLabel(source: DataSource) {
  if (source.status.reason === "configured") return "configured";
  if (source.status.reason === "planned") return "planned";
  return "missing-required-env";
}

export function DataSourcePanel() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetch("/api/research/data-sources", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Data source request failed: ${response.status}`);
        }
        const payload = (await response.json()) as { sources?: DataSource[] };
        setSources(payload.sources ?? []);
      })
      .catch((rawError) => {
        if ((rawError as Error).name === "AbortError") return;
        setSources([]);
        setError(rawError instanceof Error ? rawError.message : String(rawError));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const counts = useMemo(() => {
    return sources.reduce(
      (summary, source) => {
        summary.total += 1;
        if (source.status.enabled) summary.configured += 1;
        if (source.status.reason === "planned") summary.planned += 1;
        if (source.status.reason === "missing-required-env") summary.missing += 1;
        return summary;
      },
      { total: 0, configured: 0, missing: 0, planned: 0 },
    );
  }, [sources]);

  return (
    <section className="data-source-panel">
      <div className="data-source-head">
        <div>
          <p className="eyebrow">Research Inputs</p>
          <h2>Market data readiness</h2>
        </div>
        <span>{loading ? "checking" : `${counts.configured}/${counts.total} ready`}</span>
      </div>

      {error ? <p className="agent-error">{error}</p> : null}

      <div className="data-source-grid">
        {sources.map((source) => (
          <article key={source.name}>
            <div className="data-source-row">
              <strong>{source.name}</strong>
              <span className={`source-status source-status-${source.status.reason}`}>
                {statusLabel(source)}
              </span>
            </div>
            <p>{source.notes}</p>
            <dl>
              <div>
                <dt>runtime</dt>
                <dd>{sourceLabel(source.source)}</dd>
              </div>
              <div>
                <dt>secret</dt>
                <dd>{source.requiresSecret ? "server only" : "none"}</dd>
              </div>
              <div>
                <dt>missing</dt>
                <dd>{source.status.missingEnv?.length ?? 0}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <p className="data-source-note">
        External feeds stay opt-in and server-side. This panel shows capability state only, not market data or secret values.
      </p>
    </section>
  );
}
