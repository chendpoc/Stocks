# Deterministic Signal Pipeline

Status: Supporting dependency

## Requirement

Implement or harden Rule Engine, Scoring Engine, Risk Engine, and Signal
Manager so model judgment is constrained by auditable rules and risk gates.

## Source

- [Agent Core development README](../../research-agent/target-system/trader-agent/01-agent-core-development/README.md)

## Entry Note

Keep deterministic signal processing available as a dependency, but do not make
it the current mainline while workflow maturity is the focus.

## Boundary

This requirement should strengthen rule/risk/signal contracts. It should not
introduce autonomous execution, automatic RulePack mutation, or model promotion.

## Next Action

Create a focused spec that maps existing backend/shared/workflow code to the
deterministic signal pipeline contract and identifies the smallest missing
slice.
