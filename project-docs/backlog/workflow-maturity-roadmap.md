# Workflow Maturity Roadmap

Status: current focus

## Purpose

The next phase is workflow-first. The goal is not to add many graph files, but
to make a small set of workflows durable, reviewable, and able to improve from
outcomes without bypassing policy gates.

Agent Core work should stay supporting unless a workflow slice needs a concrete
backend/shared capability.

## Terminology Gate

Before writing active specs for this phase, use
[Ubiquitous language](../../UBIQUITOUS_LANGUAGE.md) as the canonical vocabulary
for workflow, graph, evidence, candidate, policy, and agent boundaries.

## Maturity Target

A workflow is mature enough for this phase when it has:

- stable typed input and output;
- durable `run_id`, checkpoint, artifact, and audit-event semantics;
- compact LLM context using evidence summaries and `EvidenceRef` links;
- replayable or inspectable run history;
- outcome linkage back to prior decisions, candidates, or reports;
- reflection output that creates improvement candidates, not automatic changes;
- explicit policy checks before candidate promotion, model switching, or
  RulePack mutation.

## Focus Workflows

| Workflow | Current state | Maturity target |
|---|---|---|
| `Stage1Runtime` | implemented | One canonical run/checkpoint/audit contract for workflow runs. |
| `DecisionGraph` | implemented | First mature workflow: keep the current graph shape, harden `build_context_snapshot`, and expose context snapshot summaries for CLI and LangGraph Web UI review. |
| `OutcomeGraph` | implemented | Reliable feedback labels linked to original decisions/candidates. |
| `EvaluationGraph` | implemented | Evaluation reports that can feed reflection without mutating policy. |
| `InsightExplorationGraph` | implemented | Candidate generation constrained by family, evidence, and weight caps. |
| `AlphaResearchGraph` | planned | Later workflow that should reuse mature context, evidence, artifact, and inspection patterns from `DecisionGraph`. |
| `ReflectionGraph` | planned | Improvement proposals from outcomes and evaluation reports, behind manual gates. |

## Phase Plan

1. Spec `DecisionGraph maturity v1` around `build_context_snapshot`.
2. Add focused contract tests for source mapping, empty-source behavior, and
   `EvidenceRef` de-duplication.
3. Expose context snapshot summaries in `runs show`.
4. Add minimal `context snapshots list/show` inspection commands.
5. Define `Workflow Feedback Loop maturity v1` around `OutcomeGraph`,
   `EvaluationGraph`, and `InsightExplorationGraph` handoff contracts.
6. Implement graph-specific maturity tasks in order: Outcome, Evaluation,
   Insight.
7. Align runtime run/checkpoint/audit semantics around mature workflow runs.
8. Revisit `AlphaResearchGraph` only after the DecisionGraph inspection loop
   and feedback loop contracts are reusable.

## Non-Goals

- No broker execution.
- No automatic RulePack mutation.
- No automatic model promotion or switching.
- No workflow builder or agent-generated workflow activation.
- No broad Agent Core completion unless it directly unblocks the workflow slice.

## Next Action

Start with [DecisionGraph maturity v1](./now/decision-graph-maturity-v1.md),
then use [Workflow feedback loop hardening](./now/workflow-feedback-loop-hardening.md)
to mature the Outcome/Evaluation/Insight handoff before returning to
`AlphaResearchGraph`. Runtime run/checkpoint/audit alignment should follow the
concrete mature workflow contracts instead of preceding them.
