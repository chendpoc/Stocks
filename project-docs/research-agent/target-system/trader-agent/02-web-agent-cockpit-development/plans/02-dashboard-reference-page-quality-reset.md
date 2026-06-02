# Plan 02 Dashboard Reference Page Quality Reset

## Goal

Turn `/cockpit/dashboard/live` into the reference-quality page for Agent Market Cockpit.

This plan is design-first. It does not authorize immediate code changes. It defines the sequence needed before a worker implements the dashboard reset.

## Why This Plan Exists

The current dashboard can build and pass tests, but that is not enough. The page still feels like a set of patched modules rather than a senior-grade market command surface.

The root cause is not missing data. It is missing design governance:

- no locked page composition
- no cockpit primitive layer
- weak visual review gate
- too many direct Tailwind class decisions inside page files
- tests protecting local structure instead of product-level quality

## In Scope

- `/cockpit/dashboard/live`
- `LiveDashboard`
- dashboard-specific child components
- shared cockpit primitives needed by dashboard
- dashboard visual test expectations
- screenshot review workflow

## Out of Scope

- `/cockpit/chat` redesign
- read-only Agent Core adapter integration
- DeepSeek chat implementation
- Activity DAG implementation
- trading, execution, approval, scheduler or task-control surfaces
- new UI library evaluation unless HeroUI cannot support an approved primitive

## Product Job

The dashboard must answer:

1. What is the market state right now?
2. What does the Agent think the market intent is?
3. What should I pay attention to today?
4. Why is this item worth attention?
5. What condition would confirm or invalidate it?

The page should not try to answer every detail inline. Details belong in the drawer.

## Target Information Architecture

```text
--------------------------------------------------------------------------------+
| Header: title, active symbol/context, freshness, refresh, search               |
+--------------------------------------------------------------------------------+
| L1 Status Row: Market Gate | Open Signals | Invalidated | Data Freshness       |
+--------------------------------------------------------------------------------+
| L2 Intent Strip: concise market intent, why wait, next watch, evidence count   |
+--------------------------------------------------------------------------------+
| L3 Today Focus Queue: table-first, local filters, row actions                  |
|   - row select opens right drawer                                               |
|   - table body scrolls locally when needed                                      |
+--------------------------------------------------------------------------------+
| Right Drawer: selected focus detail                                             |
|   reason | trigger | invalidation | evidence | related Agent nodes             |
+--------------------------------------------------------------------------------+
```

## Layout Rules

| Area | Rule |
|---|---|
| Header | One line on desktop, compact controls, no decorative account icons |
| L1 | Four balanced cards, equal visual weight |
| L2 | Strip, not large card; concise and horizontally scannable |
| L3 | Primary module; table owns most vertical attention |
| Drawer | Opens over right side; body scrolls internally |
| Sidebar | Stays fixed/independently scrollable |
| Main | May scroll vertically if viewport is short |

## Component Primitive Requirements

Implement or reuse these before local page-specific variants:

- `CockpitPage`
- `CockpitSection`
- `CockpitMetricCard`
- `CockpitIntentStrip`
- `CockpitTable`
- `CockpitDrawer`
- `StatusTag`
- `SemanticTag`
- `EvidenceList`
- `AgentExplanationBlock`

The first implementation can be minimal. The key is to centralize rules instead of repeating page-local class stacks.

## HeroUI Usage Rule

Use HeroUI primitives where they fit:

- Table
- Drawer
- Button
- Chip
- Input
- Select
- Card only when the surface is truly a card

Do not use raw `<table>`, raw native `<select>`, or one-off card-like `<div>` structures when an approved primitive exists.

## Image2 Sketch Prompt File

Before implementation, create a prompt file under `plans/`:

`02-dashboard-reference-page-image2-prompt.md`

The prompt must include:

- route: `/cockpit/dashboard/live`
- viewport: desktop 1440x900 and compact desktop 1280x720
- product role: personal quant market command surface
- layout: header, L1, L2, L3, drawer
- density: compact financial terminal
- table behavior: sticky header, nowrap headers, visible actions
- drawer behavior: selected row detail, explanation/evidence sections
- exclusions: trading execution, account actions, approval/task/rule admin

The prompt should produce a design sketch, not implementation code.

## Product Owner Review Questions

Ask these before coding:

1. Should Dashboard prioritize table density or explanation readability when space is tight?
2. Should the drawer open by row click, by `查看`, or both?
3. Should row actions be `查看 / 本地关注 / 忽略`, or should only one primary action remain visible?
4. Should Market Intent Strip show chart context, or should chart stay out of dashboard v1?
5. Should global search filter Today Focus Queue immediately after Enter only, or after debounce?

Do not ask implementation questions such as class names or file names.

## Implementation Worker Scope

The future worker may edit:

- `apps/trader-cockpit/components/cockpit/dashboard/**`
- `apps/trader-cockpit/components/cockpit/primitives/**`
- `apps/trader-cockpit/lib/i18n/resources.json`
- `test/trader-cockpit-phase0.test.mjs`

The future worker must not edit:

- `apps/trader-agent/**`
- `apps/research-console/**`
- `docs/**` during implementation
- `package.json`
- `pnpm-lock.yaml`

## Verification Commands

```powershell
pnpm --filter trader-cockpit lint
pnpm --filter trader-cockpit build
node --test test/trader-cockpit-phase0.test.mjs
```

## Visual Verification

Capture screenshots for:

- `/cockpit/dashboard/live` at desktop width
- `/cockpit/dashboard/live` at compact desktop width
- drawer open state
- table scrolled state

Visual review must check:

- no clipped text in key controls
- no wrapped table headers
- row actions visible
- Today Focus Queue dominates the page
- Market Intent Strip does not feel bloated
- drawer has clear section hierarchy
- sidebar remains usable during main scroll

## Acceptance Criteria

- Dashboard has one clear primary job.
- Dashboard visual hierarchy matches the approved sketch.
- Dashboard uses cockpit primitives instead of page-local repeated structures.
- HeroUI components are used through approved wrappers where possible.
- Main scroll and local scroll boundaries are intentional.
- No excluded first-version surfaces appear.
- Tests pass.
- Browser screenshots are reviewed before commit.

## Stop Condition

If the design sketch or product-owner answers contradict this plan, update this plan first. Do not let implementation drift ahead of the accepted design.
