/**
 * Finite alpha candidate families for Rule Discovery / Insight Exploration.
 *
 * This is intentionally a small enum-like taxonomy, not a registry, storage
 * schema, or plugin system. A candidate still needs evidence requirements,
 * lite backtest, shadow tracking, and manual approval before it can affect
 * an active RulePack.
 */
export const CANDIDATE_FAMILIES = [
  "momentum_trend",
  "mean_reversion",
  "event_driven",
  "liquidity_flow_microstructure",
  "relative_value_lead_lag",
  "cross_sectional_filter",
] as const;

export type CandidateFamily = (typeof CANDIDATE_FAMILIES)[number];

export type CandidateFamilyRole = "primary_research_family" | "supporting_filter";

export interface CandidateFamilyDefinition {
  id: CandidateFamily;
  label: string;
  role: CandidateFamilyRole;
  research_question: string;
  description: string;
  examples: readonly string[];
}

export const CANDIDATE_FAMILY_DEFINITIONS: Record<
  CandidateFamily,
  CandidateFamilyDefinition
> = {
  momentum_trend: {
    id: "momentum_trend",
    label: "Momentum / Trend",
    role: "primary_research_family",
    research_question: "Do prior winners, breakouts, or relative strength continue?",
    description:
      "Continuation candidates based on price trend, breakout, relative strength, or sector momentum.",
    examples: [
      "3-12 month cross-sectional momentum",
      "short-term breakout continuation",
      "sector-relative strength after catalyst",
    ],
  },
  mean_reversion: {
    id: "mean_reversion",
    label: "Reversal / Mean Reversion",
    role: "primary_research_family",
    research_question: "Did the market overreact, and is a partial reversion likely?",
    description:
      "Reversion candidates after sharp moves, gaps, opening imbalance, or intraday overextension.",
    examples: ["gap fill", "sharp-drop rebound", "open-drive fade", "VWAP reversion"],
  },
  event_driven: {
    id: "event_driven",
    label: "Event-Driven",
    role: "primary_research_family",
    research_question: "Does the market underreact or overreact after a dated event?",
    description:
      "Candidates tied to earnings, filings, holder changes, buybacks, policy, regulatory, or macro news.",
    examples: [
      "post-earnings drift",
      "filing reaction lag",
      "holder reduction digestion",
      "regulatory-news repricing",
    ],
  },
  liquidity_flow_microstructure: {
    id: "liquidity_flow_microstructure",
    label: "Liquidity / Flow / Microstructure",
    role: "primary_research_family",
    research_question: "Do flow, volume, or intraday market structure predict price moves?",
    description:
      "Candidates based on volume shocks, fixed intraday windows, VWAP reclaim, close pressure, or order-flow proxies.",
    examples: [
      "fixed-time intraday rally or selloff",
      "volume shock continuation",
      "VWAP reclaim",
      "closing pressure reversal",
    ],
  },
  relative_value_lead_lag: {
    id: "relative_value_lead_lag",
    label: "Relative Value / Lead-Lag",
    role: "primary_research_family",
    research_question: "Does a related asset, sector, index, or spread lead the target?",
    description:
      "Candidates using relationships among similar or economically linked assets, including spreads, pairs, and lead-lag effects.",
    examples: [
      "sector-neutral spread reversion",
      "index-to-component lead-lag",
      "pair divergence",
      "supplier-customer reaction lag",
    ],
  },
  cross_sectional_filter: {
    id: "cross_sectional_filter",
    label: "Cross-Sectional Filter",
    role: "supporting_filter",
    research_question: "Which symbols should be included, excluded, or risk-adjusted?",
    description:
      "Universe and risk filters such as quality, value, low risk, liquidity, size, or volatility. In v0 this supports other families instead of generating trades alone.",
    examples: [
      "quality screen",
      "earnings-yield screen",
      "low-beta defensive filter",
      "liquidity eligibility filter",
    ],
  },
};

export function isCandidateFamily(value: string): value is CandidateFamily {
  return (CANDIDATE_FAMILIES as readonly string[]).includes(value);
}
