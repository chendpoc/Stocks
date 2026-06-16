# T037 P0-A2 — Longbridge tool registry split

## Source-of-truth
- project-docs/refactor/trader-cli-reasoning-and-split-plan.md §A.2
- apps/trader-cli/src/llm/toolRegistry.longbridge.ts

## Allowed files
- apps/trader-cli/src/llm/toolRegistry.longbridge.ts
- apps/trader-cli/src/llm/longbridge/**
- apps/trader-cli/src/llm/longbridgeTools.test.ts (optional)

## Forbidden
- toolRegistry.bootstrap.ts, prompts, CLI commands, provider calls

## Preserve
- All 23 tool names and LONGBRIDGE_TOOLS registration order
- toolRegistry.bootstrap.ts import path unchanged

## Verification
```powershell
npm --prefix apps/trader-cli exec tsc -- --noEmit
npm --prefix apps/trader-cli test
```
