# Trade Ticket Generator

Status: Later

## Requirement

Turn a gated opportunity into a reviewable trade-ticket draft with trigger,
stop, invalidation, target, and risk notes.

## Source

- [Trade Ticket Generator](../../research-agent/target-system/trader-agent/01-agent-core-development/17-trade-ticket-generator.md)

## Entry Note

Does not execute orders or approve itself.

## Boundary

Trade tickets are drafts for review. They must not submit orders, bypass risk
checks, or imply execution readiness.

## Next Action

Revisit after deterministic signal/risk gates and approval contracts are
stable.
