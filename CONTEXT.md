# Stock Community Trading Agent Context

This context defines the domain language for the local self-evolving trading agent. It describes trading-decision concepts, not implementation choices.

## Language

**DecisionEnvelope**:
An immutable structured trading judgment produced by the model for one symbol at one point in time. Human input can annotate or override it downstream, but must not rewrite the original model judgment.
_Avoid_: editable decision, chat answer, hypothesis

**ContextSnapshot**:
An immutable weighted view of the evidence available when a DecisionEnvelope was produced. It contains processed context and evidence references rather than raw large objects.
_Avoid_: raw context dump, mutable context

**WeightedContextItem**:
A processed evidence item with source, summary, evidence reference, confidence, relevance, freshness, source-quality weight, and verification status. It is the unit used to build a ContextSnapshot.
_Avoid_: raw evidence, unweighted snippet

**InsightCandidate**:
An unverified market pattern or mechanism proposed by controlled model exploration. It cannot become a high-weight lesson or directly drive trading decisions until evidence validates it.
_Avoid_: lesson, rule, proven pattern

**AcceptedLesson**:
A market lesson accepted only after replay or outcome evidence supports it. It can be used as stronger context for future decisions.
_Avoid_: candidate insight, model opinion

**OutcomeLabel**:
A measured post-decision result for a fixed horizon such as 30m, 1h, EOD, 1d, or 3d. It compares absolute return, relative benchmark return, and invalidation or target proxies.
_Avoid_: subjective review, paper result

**HumanOverride**:
A human downstream change that can supersede a model action while preserving the original DecisionEnvelope. It is evaluated separately so the system can distinguish model quality from human intervention.
_Avoid_: editing the decision, silent correction

**PaperCandidateAction**:
A model action that marks a decision as a candidate for future paper execution. In Stage 1 it is evaluated by outcomes but does not submit a broker order.
_Avoid_: paper order, live trade

**WorkflowCommandEnvelope**:
A machine-readable JSON response emitted by `apps/trader-workflows` commands. CLI wrappers forward it and may render it, but must not implement graph logic themselves.
_Avoid_: ad hoc console text, CLI-owned workflow state

**RuntimeCheckpointStore**:
The LangGraph-owned store for run state, current node, resume or interrupt metadata, and checkpoint lineage. It is separate from `market_intel.db`, which stores trading-domain facts.
_Avoid_: domain table, decision store, market_intel runtime metadata
