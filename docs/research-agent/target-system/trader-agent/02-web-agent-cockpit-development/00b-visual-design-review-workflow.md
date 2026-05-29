# 00b Visual Design Review Workflow

## Goal

Define the mandatory workflow for changing Agent Market Cockpit page structure, layout, interaction model, visual hierarchy or major component composition.

The purpose is to prevent local UI patching from drifting away from the actual product workflow. The product owner is the real user of this cockpit, so interaction decisions must be reviewed with the product owner before implementation.

## When This Workflow Applies

Use this workflow before any change that affects:

- page information architecture
- first-viewport composition
- module placement, sizing or scroll boundaries
- navigation and route entry points
- drawer, modal, panel, split-view or drill-down behavior
- chat, Agent console, activity trace or workflow visualization layout
- table density, chart placement or evidence display strategy
- new UI libraries, design-system primitives or complex components

This workflow is not required for copy fixes, small typo fixes, broken import fixes, type fixes or test-only maintenance.

## First Principles

1. Cockpit pages are working surfaces, not marketing pages.
2. A page must have one primary job; secondary modules cannot compete with it.
3. The first viewport should expose the user's decision context without forcing whole-page scrolling.
4. Dense data should scroll locally inside the relevant module, not by stretching the page.
5. Tables, charts and evidence panels should use mature UI primitives when available.
6. Interaction decisions belong to the product owner when they affect real usage habits.
7. Implementation starts only after the visual structure and interaction model are reviewed.

## Required Workflow

| Step | Output | Gate |
|---:|---|---|
| 1 | Current-state screenshot or page inventory | Confirm which page and state are being reviewed |
| 2 | Problem statement from first principles | Identify whether the issue is information architecture, component sizing, data density, navigation or interaction |
| 3 | Image2 low-fidelity sketch | Generate a page-structure sketch before touching code |
| 4 | Sketch review | Check first viewport, module hierarchy, scroll boundary, drill-down path and interaction cost |
| 5 | Skill discovery | Use `find-skills` to search for suitable UI/UX/design-system/frontend skills when a specialized design workflow may help |
| 6 | Design draft | Produce a more concrete design proposal or design-spec based on the reviewed sketch |
| 7 | Product-owner questions | Ask for decisions on interaction tradeoffs, not implementation details |
| 8 | Spec gate | Use `module-spec-quality-gate` to freeze source, scope, allowed files and verification |
| 9 | Implementation | Split coding into bounded direct work or worker prompts |
| 10 | Verification | Run lint/build/tests and browser screenshot review |

## Product Owner Decision Gate

Ask before implementation when the issue involves:

- whether a detail opens in drawer, route, modal or inline split panel
- whether a module should be visible on first viewport or moved behind drill-down
- whether a table should favor density, readability or scanning speed
- whether a chart should be summary-only or interactive
- whether Agent push content interrupts the user or stays passive
- whether local scroll, pagination or virtualized lists should be used
- whether a new UI library or graph library should be introduced

Do not resolve these decisions silently. Provide 2 to 3 options with tradeoffs and a recommendation.

## Image2 Sketch Requirements

Each sketch prompt should specify:

- target route and viewport size
- page job and target user behavior
- module names and relative hierarchy
- fixed versus scrollable regions
- expected drill-down behavior
- excluded features and current-version boundaries

The sketch should optimize layout and interaction, not visual decoration.

## Skill Discovery Policy

Use `find-skills` before design-draft work when:

- the problem is UI/UX-heavy
- a specialized React, Next.js, design-system, accessibility, table, chart or graph workflow may reduce hand-written complexity
- the current implementation feels like local patching instead of systematic design

Prefer mature, reputable skills from well-known sources. If no suitable skill exists, continue with local design reasoning and record that no skill was selected.

## NPM Library Policy

Before implementing any complex UI component (chart, graph, virtual list, drag-and-drop, rich text, timeline, etc.), search for a well-maintained npm library first. Decision order:

1. HeroUI already provides the primitive → use it directly (Table, Drawer, Chip, Select, etc.)
2. A well-maintained npm library exists → install it and wrap with a thin business-semantic layer in `components/cockpit/ui/`
3. Both 1 and 2 fail → implement manually, but extract into a shared component, never inline in a page

Do not hand-roll a complex control when a mature library already solves the problem. The `@xyflow/react` adoption for the activity graph is an example of correct library-first behavior.

## Review Checklist

For every visual design review, check:

- Does the page have one primary job?
- Can the first viewport be understood without whole-page scrolling?
- Are dense lists/tables locally scrollable?
- Are table headers and key labels readable without wrapping?
- Is the user's next action obvious?
- Is drill-down behavior explicit?
- Is the Agent visible without dominating market evidence?
- Are status, tag and risk colors semantic rather than decorative?
- Are mock/fallback states visible but not noisy?
- Are first-version exclusions still respected?

## Implementation Boundary

Do not implement until:

- the sketch has been reviewed
- product-owner interaction decisions are answered
- the design draft is accepted
- the implementation plan or worker prompt has passed the spec gate
- the coding scope is split into bounded tasks

Worker prompts must state:

- allowed files
- forbidden files
- whether the task may change layout, data contracts or only styling
- verification commands
- no commit unless explicitly requested

## Verification

After implementation, verify:

```powershell
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
```

For visual changes, also capture browser screenshots for the affected routes and inspect console/page errors.

## Current-Version Exclusions

This workflow must not reintroduce:

- trading execution surfaces
- order-shaped objects
- account trading actions
- standalone approval center
- scheduler or task control console
- standalone capability permission console
- standalone rule editor
- standalone audit console
