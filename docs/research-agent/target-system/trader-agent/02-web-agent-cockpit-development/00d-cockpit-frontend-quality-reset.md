# 00d Cockpit Frontend Quality Reset

## Purpose

This document resets the frontend development process for `apps/trader-cockpit`.

The current problem is not a single component bug. The deeper issue is that page development has been driven by route checklists, mock data wiring and class-level regression tests before the cockpit has a stable design system, visual hierarchy and page acceptance model.

The reset goal is to make one reference page production-grade first, then reuse its design system across the rest of the cockpit.

## First Principles

1. The cockpit is a personal market command surface, not a generic SaaS dashboard.
2. The first screen must help the user understand market state, market intent and attention priorities.
3. Agent output must be close to the market evidence it explains.
4. Dense data should use table-first and local-scroll patterns, but page-level scroll is allowed when content naturally exceeds one viewport.
5. The UI must be designed around the product user's workflow before implementation starts.
6. Build, lint and unit tests are necessary but not enough for frontend quality.
7. Visual review is a hard gate for layout, hierarchy, density, scrolling and interaction changes.

## What Went Wrong

| Problem | Root cause | Required correction |
|---|---|---|
| Pages feel assembled instead of designed | Implementation started from feature checklists rather than a locked visual system | Freeze layout rules and primitives before page work |
| Components look inconsistent | HeroUI was used directly with local Tailwind class patches | Wrap HeroUI into cockpit-specific primitives |
| Information hierarchy is weak | Each module was developed independently | Define page jobs, primary regions and secondary regions first |
| Scroll and height bugs repeat | Shell, page, module and card scroll boundaries were not governed centrally | Define one scroll policy and test it |
| Review catches bugs late | Review agents mostly checked code boundaries and banned language | Add design review findings as first-class blockers |
| Tests lock in temporary structure | Regex tests assert local class details too early | Tests should protect product contracts, not accidental class strings |

## Reset Scope

The first reset target is `/cockpit/dashboard/live`.

Dashboard is the correct reference page because it contains the main cockpit grammar:

- sidebar context
- market gate
- market intent explanation
- attention queue
- table density
- selected detail drawer
- Agent evidence and explanation
- read-only boundaries

Do not reset every page at once. A broad rewrite would hide quality problems and make review harder.

## Non-Goals

- Do not connect real Agent Core APIs in this reset.
- Do not add trading, execution, approval or task-control surfaces.
- Do not introduce a graph/DAG library for the dashboard reset.
- Do not redesign `/cockpit/chat` until Dashboard has become the reference page.
- Do not add a new UI library unless HeroUI cannot support the required primitive.

## Required Development Sequence

| Step | Output | Gate |
|---:|---|---|
| 1 | Current page screenshot and problem inventory | Product owner agrees the observed problem is real |
| 2 | Image2 sketch prompt file | Prompt is stored in `plans/` and references exact page job |
| 3 | Low-fidelity image sketch | Product owner reviews information hierarchy and interaction |
| 4 | Dashboard reference spec | Layout, scroll, table, drawer and status rules are explicit |
| 5 | Cockpit primitive plan | Wrapper components and token usage are named before coding |
| 6 | Spec gate | `module-spec-quality-gate` confirms source, scope, worker prompt and verification |
| 7 | Worker or direct implementation | Edits stay inside approved dashboard/primitives scope |
| 8 | Browser screenshot verification | Visual review passes before commit |
| 9 | Code verification | lint, build and phase tests pass |

## Mandatory Design System Primitives

Future page work should prefer cockpit primitives over raw HeroUI usage.

| Primitive | Responsibility |
|---|---|
| `CockpitPage` | Page shell inside `CockpitShell`; owns page scroll behavior |
| `CockpitSection` | Titled work surface with consistent spacing and density |
| `CockpitMetricCard` | L1 compact status card with fixed typography rules |
| `CockpitIntentStrip` | Market intent summary with semantic status chips |
| `CockpitTable` | Dense table wrapper around HeroUI table primitives |
| `CockpitDrawer` | Right-side detail surface for selected market item |
| `StatusTag` | Lifecycle status badge |
| `SemanticTag` | Content classification badge |
| `EvidenceList` | Compact evidence bullets with source/freshness metadata |
| `AgentExplanationBlock` | Conclusion, reason, trigger, invalidation and uncertainty |

The implementation may create these incrementally. It must not hand-roll one-off variants when a primitive already exists.

## Visual Language

| Axis | Decision |
|---|---|
| Tone | dense financial command surface |
| Density | compact, table-first, controlled whitespace |
| Color | semantic first, decorative second |
| Typography | small, stable, scan-oriented |
| Motion | minimal; only loading, refresh, selection and drawer transitions |
| Agent presence | visible as explanation and context, not as decorative assistant chrome |
| Shape | restrained radius, low ornamental decoration |

## Scroll Policy

| Layer | Rule |
|---|---|
| `CockpitShell` | Sidebar stays viewport-pinned and independently scrollable |
| Main content | May scroll vertically when a page exceeds the viewport |
| Dashboard reference page | First viewport should show L1/L2/L3 entry, but exact one-screen fit is not mandatory |
| Dense tables | Prefer local vertical scroll inside table region |
| Drawers | Drawer body scrolls internally |
| Cards | Cards must not clip dynamic text unless the truncation is intentional and visible |

The rule is not "never scroll". The rule is "no accidental clipping and no hidden primary workflow".

## Dashboard Reference Acceptance

Dashboard reset is accepted only when all items are true:

- The page has one visible primary job: understand today's market attention queue.
- L1 status cards are balanced and compact.
- Market intent explanation is concise and does not dominate the page.
- Today Focus Queue is the visual anchor.
- Table headers do not wrap.
- Row actions remain visible.
- Detail opens in a right drawer, not a route jump.
- Drawer content is structured as explanation, conditions, evidence and related Agent nodes.
- Sidebar remains usable while the main content scrolls.
- There is no accidental clipping in push strips, tags, cards, tables or drawers.
- Browser screenshots are reviewed for desktop and a narrower viewport.

## Test Policy

Tests should protect product contracts:

- route availability
- adapter boundary
- no direct fixture imports in pages/components
- no excluded first-version surfaces
- table uses approved table primitive
- drawer exists for dashboard detail
- main content scroll policy
- no fixed-height clipping for dynamic push/content regions

Tests should avoid overfitting to temporary utility class sequences unless the class expresses a product contract such as scroll policy.

## Worker Prompt Policy

Every future frontend worker prompt must include:

- spec gate result or accepted plan path
- target route and page job
- approved sketch/spec document
- allowed files
- forbidden files
- HeroUI-first primitive rule
- no raw business `.js` or `.mjs`
- `@/*` import rule
- visual screenshot verification requirement
- exact lint/build/test commands
- no commit

## Review Agent Policy

Review agents must lead with design and interaction findings before code hygiene.

Blocking findings include:

- broken visual hierarchy
- accidental clipping
- page/module scroll conflict
- table header wrapping
- row actions disappearing
- Agent explanation detached from evidence
- one-off hand-rolled component where an approved primitive exists
- generic SaaS layout that does not feel like a market cockpit

## Next Action

Execute [plans/02-dashboard-reference-page-quality-reset.md](./plans/02-dashboard-reference-page-quality-reset.md) before making more dashboard code changes.
