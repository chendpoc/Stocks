import type { EvidenceRun } from "@stock-summary/summary-core";
import { Badge } from "../ui/badge";

const VERDICT_LABELS: Record<EvidenceRun["verdict"], string> = {
  supporting: "supporting",
  contradicting: "contradicting",
  neutral: "neutral",
  blocked: "blocked",
  error: "error",
};

function verdictVariant(verdict: EvidenceRun["verdict"]) {
  if (verdict === "supporting") return "success";
  if (verdict === "contradicting" || verdict === "blocked" || verdict === "error") return "destructive";
  return "secondary";
}

export function EvidenceTimeline({ runs }: { runs: EvidenceRun[] }) {
  if (!runs.length) {
    return <p className="inspector-muted">尚无 evidence run。先从证据动作补齐 quote、history 或 news。</p>;
  }

  return (
    <div className="evidence-timeline evidence-timeline-compact" aria-label="最近 evidence runs">
      {runs.map((run) => (
        <article className={`evidence-run evidence-run-${run.verdict}`} key={run.id}>
          <div className="evidence-run-head">
            <strong>{run.toolName}</strong>
            <Badge variant={verdictVariant(run.verdict)}>{VERDICT_LABELS[run.verdict]}</Badge>
          </div>
          <p>{run.summary}</p>
          <small>
            {run.sourceType} / {run.fromCache ? "cached" : "fresh"} / {run.createdAt}
          </small>
        </article>
      ))}
    </div>
  );
}
