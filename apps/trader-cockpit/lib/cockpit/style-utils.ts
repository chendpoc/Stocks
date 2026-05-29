import type { CockpitTag, SignalStatus } from "./adapter";

// ---- Confidence ----

export function confidenceClass(confidence: string): string {
  if (confidence === "high") return "text-success";
  if (confidence === "medium") return "text-warning";
  return "text-muted";
}

// ---- Risk / gate ----

export function riskClass(value: string): string {
  if (value === "critical" || value === "high" || value === "block") return "text-danger";
  if (
    value === "medium" ||
    value === "caution" ||
    value === "watching" ||
    value === "waiting_trigger" ||
    value === "near_trigger"
  ) {
    return "text-warning";
  }
  return "text-success";
}

export function gateClass(marketGate: string): string {
  if (marketGate === "block") return "border-danger/50 bg-danger/10 text-danger";
  if (marketGate === "caution") return "border-warning/50 bg-warning/10 text-warning";
  return "border-success/50 bg-success/10 text-success";
}

// ---- Signal status ----

export function signalStatusClass(status: SignalStatus): string {
  if (status === "invalidated" || status === "triggered_for_attention") {
    return "border-danger/50 bg-danger/10 text-danger";
  }
  if (status === "near_trigger" || status === "waiting_trigger") {
    return "border-warning/50 bg-warning/10 text-warning";
  }
  if (status === "needs_more_evidence") return "border-accent/50 bg-accent/10 text-accent";
  return "border-success/50 bg-success/10 text-success";
}

// ---- Focus item status (Dashboard) ----

export function focusStatusClass(status: string): string {
  if (status === "triggered" || status === "active") return "border-success/40 text-success";
  if (status === "invalidated") return "border-danger/40 text-danger";
  if (status === "waiting") return "border-warning/40 text-warning";
  return "border-border text-muted";
}

// ---- Tag ----

export function tagClass(tag: CockpitTag): string {
  if (tag === "opportunity_watch") return "border-danger/40 bg-danger/10 text-danger";
  if (tag === "market_intent") return "border-success/40 bg-success/10 text-success";
  if (tag === "rule_learning") return "border-accent/40 bg-accent/10 text-accent";
  if (tag === "risk_or_invalidation") return "border-warning/50 bg-warning/10 text-warning";
  if (tag === "news_event") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-background/60 text-muted";
}

// ---- Priority (Dashboard) ----

export function priorityClass(priority: number): string {
  if (priority >= 85) return "border-danger/40 bg-danger/10 text-danger";
  if (priority >= 70) return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-background/60 text-muted";
}

export function priorityLabel(priority: number): string {
  if (priority >= 85) return "P1";
  if (priority >= 70) return "P2";
  return "P3";
}
