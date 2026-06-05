# Ubiquitous Language

Status: current terminology gate for workflow and backlog specs.

This file defines canonical terms for the workflow-first phase. Use these terms
before writing new backlog specs, graph specs, CLI commands, or LangGraph Web UI
descriptions.

## Workflow Runtime

| Term | Definition | Aliases to avoid |
|---|---|---|
| **Workflow** | A durable business process with typed input, inspectable progress, and persisted output artifacts. | flow, feature flow, process |
| **Native LangGraph Graph** | A workflow implemented as a LangGraph `StateGraph` and registered in `langgraph.json` for Web UI visualization. | graph, LangGraph flow |
| **Service Wrapper Workflow** | A workflow implemented with ordinary services or classes and inspected through runtime artifacts instead of native graph topology. | hidden graph, fake graph |
| **Workflow Run** | One execution instance of a workflow identified by a stable `run_id`. | job, task run, execution |
| **Checkpoint** | Persisted resumable workflow state for a specific workflow run. | snapshot, savepoint |
| **Audit Event** | An append-only record of a workflow decision, gate result, error, resume, or material state transition. | log line, history item |
| **Run Artifact** | A durable output object referenced by id instead of embedded directly in graph state or chat context. | output blob, report blob |
| **Artifact Ref** | A small pointer to a persisted run artifact. | artifact, file ref |
| **Operator Summary** | A compact human-readable summary of a workflow run result. | final message, explanation |
| **CLI** | The command surface for starting, replaying, resuming, and inspecting workflow runs and artifacts. | terminal UI, command tool |
| **LangGraph Web UI** | The visualization surface for native graph topology, node state, and graph-level debugging. | custom web app, workflow builder |
| **Operator Surface** | Any human-facing surface used to inspect or control workflows without changing their product semantics. | UI, dashboard |

## Evidence And Context

| Term | Definition | Aliases to avoid |
|---|---|---|
| **ResearchWindow** | A structured research input scope containing symbols or universe, time window, candidate family, evidence requirements, and constraints. | free prompt, exploration text |
| **Evidence Loader** | A white-listed data accessor that turns a ResearchWindow into bounded evidence references and summaries. | crawler, search agent |
| **EvidenceRef** | A compact pointer to an evidence item with `ref_type`, `ref_id`, and optional symbol. | evidence, source, raw document |
| **Compact Evidence Summary** | An LLM-ready summary built from bounded evidence and linked back to EvidenceRefs. | evidence, context dump |
| **Context Snapshot** | A persisted set of weighted context observations for a symbol or research scope. | context, market snapshot |
| **Context Snapshot Summary** | A compact operator-facing summary of a Context Snapshot, including id, hash, item counts, evidence counts, and source-type counts. | DecisionContext, data readiness |
| **Outcome** | An observed result linked to a prior decision, candidate, or report. | result, performance |
| **InsightCandidateOutcome** | An observed result for an **InsightCandidate** after a whitelisted short-cycle horizon (`1m`, `2m`, `5m`, `30m`, `1h`, `2h`, or `4h`); it is scheduled by **InsightExplorationGraph**, labeled by **OutcomeGraph**, and is not a graph. | InsightOutcome, second graph |
| **Evaluation Report** | An analysis artifact that summarizes outcomes without mutating policy or active rules. | eval, scorecard |

## Candidates And Policy

| Term | Definition | Aliases to avoid |
|---|---|---|
| **InsightCandidate** | An unverified hypothesis record produced by insight exploration and stored with pending verification. | insight, candidate |
| **AlphaCandidate** | A validated research-stage candidate that follows the alpha candidate contract. | rule, signal, insight |
| **RuleCandidate** | A backend or shared candidate rule record that can enter evidence validation, lite backtest, shadow tracking, and manual approval. | active rule, alpha |
| **CandidateFamily** | A finite taxonomy value describing the research family of a candidate. | strategy type, bucket |
| **LiteBacktestPlan** | A planned validation protocol for a candidate, not an executed result. | backtest, report |
| **LiteBacktestReport** | The artifact produced after executing a lite backtest plan. | backtest, plan |
| **PolicyCheck** | A deterministic gate result that can reject, block, or require more review before promotion. | approval, safety check |
| **RulePack** | A versioned set of active rules used by decision systems. | rules, strategy config |
| **ReflectionProposal** | A proposed improvement derived from outcomes or evaluation reports without automatic activation. | lesson, mutation, upgrade |
| **Promotion** | Movement of a candidate or proposal toward shadow tracking, manual approval, or active system use. | activation, auto update |

## Analysis To Execution

| Term | Definition | Aliases to avoid |
|---|---|---|
| **OpportunityMap** | An analysis artifact that identifies symbols, windows, setups, and evidence-backed focus regions worth monitoring or later paper/shadow exploration. It is not an order. | signal, buy list, trade command |
| **RiskEnvelope** | An analysis artifact that defines exposure, liquidity, event-risk, invalidation, and validity-window constraints for future exploration. | risk note, prompt warning |
| **ExplorationPlan** | A plan describing what the execution simulation layer should observe locally, at what cadence, and under which trigger/stop conditions. | execution plan, order plan |
| **ExecutionPolicy** | A deterministic permission boundary that may allow observe-only, paper simulation, or shadow tracking after required preconditions and future RiskGate checks pass. | order, trade ticket, broker instruction |
| **LiveMarketDataPlane** | The read-only data infrastructure that normalizes quote, depth, trade, and derived market-state facts for analysis and execution simulation. | market graph, live trading loop |
| **ProviderTrace** | Metadata that links a normalized market fact back to its provider, source channel, request or subscription, entitlement state, timestamp, and normalization version. | vendor note, provider blob |
| **DataQualityFlag** | A visible warning or error attached to a market data artifact when data is stale, delayed, missing, replay-only, fallback-sourced, or inconsistent. | hidden fallback, best effort |
| **QuoteSnapshot** | A normalized top-of-book quote artifact containing bid/ask facts and quote timing metadata. | price quote, ticker row |
| **OrderBookSnapshot** | A normalized depth artifact containing visible bid/ask levels when provider and entitlement allow it. | depth dump, broker book |
| **TradeTick** | A normalized executed trade print with price, size, time, and optional aggressor hint. | order side, trade order |
| **SecondBar** | A normalized one-second bar derived from trade ticks, replay fixtures, or a provider bar source with explicit construction metadata. | native second candle |
| **MinuteBar** | A normalized one-minute bar with explicit construction and provider trace metadata. | chart bar |
| **MarketMicrostructureFeatures** | Deterministic features derived from quote, depth, and trade facts, such as spread, mid price, quote age, depth imbalance, and trade intensity. | AI signal, strategy rule |
| **MarketStateSnapshot** | A compact normalized live-market state artifact derived from quote, depth, trade, bars, and microstructure features. | raw ticks, context snapshot |
| **ReplayCursor** | A replay position over normalized market data facts for deterministic inspection and test windows. | live stream state, backtest cursor |
| **RiskGate** | A deterministic allow/reject/reduce gate that evaluates future order intents against policy, liquidity, exposure, and event-risk constraints. | LLM risk reviewer, risk prompt |
| **PaperTradingEngine** | A deterministic simulator for order lifecycle, fills, slippage, positions, PnL, and replay. | broker, backtest, toy trade loop |
| **OrderIntent** | A future proposed paper/live action generated after policy and risk evaluation begins; it is not produced by the AI Analysis Layer in M1. | DecisionEnvelope, ExecutionPolicy |
| **RiskDecision** | A future RiskGate output that allows, rejects, or reduces an order intent with reason codes. | LLM confidence, approval |
| **OrderEvent** | An append-only future event for submitted, accepted, filled, canceled, rejected, or expired simulated/broker orders. | log line, trade row |
| **PositionSnapshot** | A future position and exposure state artifact with realized/unrealized PnL. | portfolio note |
| **ExecutionFeedback** | A feedback artifact summarizing fill quality, slippage, rule adherence, stop behavior, and execution outcome for learning. | trade result, outcome label |

## Agent Boundaries

| Term | Definition | Aliases to avoid |
|---|---|---|
| **Agent Node** | A bounded LLM or tool-using capability inside a workflow node. | agent, autonomous worker |
| **Agent Subgraph** | A bounded native graph segment that contains multiple agent-like steps but remains owned by the parent workflow contract. | agent workflow, autonomous graph |
| **Workflow Owner** | The workflow contract that owns state, transitions, artifacts, and policy gates. | agent, graph |

## Relationships

- A **Workflow Run** belongs to exactly one **Workflow**.
- A **Native LangGraph Graph** can implement a **Workflow**, but a **Workflow** does not have to be native graph.
- A **Service Wrapper Workflow** may remain valid when topology visualization is not needed.
- **DecisionGraph** keeps its existing main graph shape while hardening the **Context Snapshot** produced by `build_context_snapshot`.
- The first DecisionGraph maturity slice exposes **Context Snapshot Summary** through the operator surface without creating a new data platform.
- **InsightExplorationGraph** creates **InsightCandidate** records and schedules matching **InsightCandidateOutcome** records; **OutcomeGraph** labels due outcomes.
- **OutcomeGraph** standardizes the current input snapshot into a `label` and an optional short `summary` before labeling due outcomes.
- A **ResearchWindow** drives **Evidence Loaders** that produce **EvidenceRefs** and a **Compact Evidence Summary**.
- An **AlphaResearchGraph** produces an **AlphaCandidate**, **PolicyCheck** results, a **LiteBacktestPlan**, **Run Artifacts**, and an **Operator Summary** in v0.
- An **AlphaCandidate** may later be mapped to a **RuleCandidate**, but neither may mutate a **RulePack** without explicit approval policy.
- A **ReflectionProposal** can create a follow-up **ResearchWindow** or candidate draft, but it cannot perform **Promotion**.
- The **CLI** and **LangGraph Web UI** inspect the same run, checkpoint, artifact, and audit contract.

## Example Dialogue

> **Dev:** "Should every **Workflow** become a **Native LangGraph Graph** so the **LangGraph Web UI** can show it?"
>
> **Domain expert:** "No. Only workflows that need topology, branching, node state, or checkpoint debugging should be native graphs; simple batch flows can stay **Service Wrapper Workflows**."
>
> **Dev:** "For **AlphaResearchGraph** v0, do we run a real backtest?"
>
> **Domain expert:** "No. v0 produces an **AlphaCandidate**, **PolicyCheck** results, and a **LiteBacktestPlan**; the executed **LiteBacktestReport** can come later."
>
> **Dev:** "Can a successful **AlphaCandidate** update the **RulePack**?"
>
> **Domain expert:** "No. It may become a **RuleCandidate**, but **Promotion** requires explicit gates and cannot be automatic in this phase."

## Flagged Ambiguities

- "Graph" has been used for both a business workflow and a LangGraph `StateGraph`; use **Workflow** for the business process and **Native LangGraph Graph** for Web UI-visible topology.
- "Candidate" has been overloaded; use **InsightCandidate**, **AlphaCandidate**, and **RuleCandidate** to identify the lifecycle stage.
- "Backtest" has been overloaded; use **LiteBacktestPlan** for the v0 planned validation protocol and **LiteBacktestReport** only after execution.
- "Agent" has been overloaded; use **Agent Node** or **Agent Subgraph** for LLM capabilities and **Workflow Owner** for state and policy ownership.
- "Web UI" has been overloaded; first-phase scope is **LangGraph Web UI** visualization, not a custom product UI or **Workflow Builder**.
- "Evidence" has been overloaded; distinguish raw source material, **EvidenceRef**, and **Compact Evidence Summary**.
- "Data readiness" is deliberately not a first-slice term for DecisionGraph maturity v1; use **Context Snapshot Summary** and explicit context tests instead.
