# Compact Evidence Summary Builder

Status: Now

## Requirement

Aggregate raw market/news/filing/backtest evidence into small LLM-ready
summaries with `EvidenceRef` links to raw data.

## Source

- [Agent engineering principles proposal](../../research-agent/target-system/trader-agent/08-agent-engineering-principles-proposal.md)
- [AI/RAG/MCP roadmap PRD](../../research-agent/target-system/trader-agent/04-ai-rag-mcp-platform-roadmap-prd.md)

## Entry Note

Prevents large tool results from polluting workflow context.

## Boundary

The builder compresses evidence for model consumption. It must preserve raw
evidence references and must not become the source of truth itself.

## Next Action

Define a compact summary schema and evidence reference contract usable by
AlphaResearchGraph and future explanation flows.

## Related

- [Intraday 1m context and minute-level analysis](../later/intraday-1m-context-and-minute-analysis.md)
  - intraday bars should use this builder pattern; not DecisionGraph-owned ingestion.
