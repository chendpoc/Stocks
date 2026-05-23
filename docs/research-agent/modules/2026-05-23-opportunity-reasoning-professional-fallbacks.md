# Opportunity Reasoning Professional Fallbacks

## Goal

Replace placeholder-like opportunity reasoning fallback text with professional, reader-facing Chinese research language.

## Why

The opportunity agent is meant to help users understand market observations. When source evidence is missing, the output should say what is missing and how to verify it. It should not expose implementation wording such as `placeholder research observation` or English default strings that make the feature look unfinished.

## Contract

- Fallback output must remain research-only and must not become buy/sell/long/short guidance.
- Missing evidence should be described as an evidence gap, not a placeholder.
- The public reasoning contract must keep the existing fields: `adminTheory`, `marketIntelNeeds`, `evidenceNeeds`, `candidateOpportunities`, `invalidationPlan`, `nextChecks`, and `researchPlan`.
- The fallback text should be Chinese-first because the product UI and daily reports are Chinese.
- No external tools, network calls, or secret reads.

## Files

- `apps/research-console/lib/opportunity-reasoning.ts`
- `test/opportunity-reasoning.test.mjs`
- `docs/research-agent/modules/2026-05-23-opportunity-reasoning-professional-fallbacks.md`
- `docs/superpowers/plans/2026-05-22-research-agent-opportunity-workbench.md`

## Test Plan

- RED: empty or weak opportunity input must not emit `placeholder`, `No source evidence`, or `No explicit opportunity`.
- RED: fallback output must include a Chinese research boundary such as `研究观察，不是交易指令`.
- GREEN: replace fallback strings with Chinese professional research framing.
- Run `node --test test\opportunity-reasoning.test.mjs`, `npm run test:summary`, and `git diff --check`.

## Implementation

- Added a regression test for weak or empty opportunity input.
- Replaced English placeholder fallback strings with Chinese research-language fallbacks.
- Kept the output bounded to research observation and preserved the existing structured contract.
- Updated the opportunity reasoning documentation to describe fallback language requirements.

## Verification

- RED verified with `node --test --test-name-pattern "fallback opportunity reasoning" test\opportunity-reasoning.test.mjs`.
- GREEN verified with `node --test test\opportunity-reasoning.test.mjs`.
- Full relevant checks passed: `npm run test:summary`, `npm run pages:build`, `git diff --check`.
