# Agent Answer Section Cards

## Purpose

Render the structured agent answer as compact section cards in the React research console.

The provider already emits stable answer sections:

- `结论`
- `证据`
- `反证`
- `下一步观察`
- `研究边界`

Keeping the answer as one pre-wrapped paragraph preserves line breaks, but it is still hard to scan in the floating research panel. The UI should parse those visible sections and render them as a readable research brief while keeping a safe plain-text fallback.

## Boundaries

- Input: existing `reply.answer` string.
- Output: browser-only section rendering.
- No schema or API changes.
- No markdown parser dependency.
- No hidden reasoning or raw chain-of-thought.
- No trading instruction wording.
- Preserve fallback rendering for malformed or model-backed free-form answers.
- Enable card rendering only when the first line is a recognized section title. This avoids hiding any prefix text emitted before `结论：`.

## Files

- `apps/research-console/components/AgentPanel.tsx`
- `apps/research-console/lib/agent-answer-sections.ts`
- `apps/research-console/app/globals.css`
- `test/daily-summary-assets.test.mjs`
- `project-docs/research-agent/modules/2026-05-23-agent-answer-section-cards.md`

## Tests

RED first:

```powershell
node --test --test-name-pattern "renders structured agent answers as section cards" test\daily-summary-assets.test.mjs
```

Expected red state:

- `AgentPanel` has no `parseAgentAnswerSections`.
- No `.agent-answer-sections` or `.agent-answer-section-card` styles exist.
- No pure parser behavior test exists for malformed free-form prefixes.

GREEN verification:

```powershell
node --test --test-name-pattern "parses structured agent answers|renders structured agent answers as section cards" test\daily-summary-assets.test.mjs
npm run console:build
npm run test:summary
git diff --check
```

## Agent Split

- Main agent owns implementation because it touches the UI component and existing large static test file.
- One review agent may audit after GREEN for over-parsing, fallback behavior, and UI scope creep.

## Risks

- Over-parsing can hide unexpected model output. Keep fallback plain-text rendering.
- The panel is narrow; card styles must stay compact.
- Section cards should improve readability, not create a new source of truth separate from `reply.answer`.
- If the answer starts with any unstructured preface before the first recognized heading, render the full answer as plain text rather than dropping that preface.
