# 01 Design Style and Interaction Principles

## Goal

Define the visual and interaction language for Agent Market Cockpit: dense financial workspace, clear Agent conversation, visible evidence and explicit uncertainty.

## Product Language

| Axis | Decision |
|---|---|
| Visual tone | professional trading/research cockpit |
| Density | high density, table-first, compact panels |
| Color | semantic status and tag colors |
| Agent presence | visible but not dominant over market evidence |
| Motion | only for state changes, streaming and refresh feedback |

## Layout Principles

1. The first viewport must look like a working market cockpit, not a chatbot landing page.
2. The user must see watchlist, active signal, chart/evidence and Agent state without context hunting.
3. Agent explanation must appear near the signal, event or source it explains.
4. Chat is a core surface, but it should not hide market context.
5. Scenario Plan is shown as attention guidance, not an order form.
6. Tool sources and evidence cards stay close to model conclusions.

## Tag Semantics

| Tag | Recommended visual role |
|---|---|
| `opportunity_watch` | amber/orange attention tag |
| `market_intent` | green interpretation tag |
| `rule_learning` | blue learning tag |
| `news_event` | violet event tag |
| `risk_or_invalidation` | red risk tag |
| `post_validation` | gray/purple validation tag |
| `external_unverified` | muted warning tag |

Use design tokens such as `tag.opportunity`, not raw color values in product docs.

## Component Style Rules

| Component | Rule |
|---|---|
| Signal cards | show status, tags, trigger, invalidation and main evidence |
| Scenario Plan | use condition tree layout, never order ticket layout |
| Chat messages | separate conclusion, evidence, tool source and uncertainty blocks |
| Tool source cards | show source name, URL when available, freshness and confidence |
| Timeline | show action/event summary, status and trace link |
| Tables | compact rows, fixed header, keyboard-friendly selection |
| Toasts | only non-critical status; signal/risk/learning items go to inbox |

## Interaction Principles

- One click from signal to evidence.
- One click from signal to chat with context.
- One click from theory to currently matched signals.
- Manual refresh is always available.
- Polling stale state is visible but non-blocking.
- No button implies trading execution or account mutation.

## Agent Interaction Rules

Agent replies must show:

- conclusion
- market intent
- evidence
- trigger conditions
- invalidation conditions
- next watch
- risk/uncertainty
- tool sources

When using external search, the UI must mark unverified external sources.

## Anti-patterns

- Landing-page hero composition.
- Large decorative cards that reduce market density.
- Chat-only page that hides current symbol/signal context.
- Order-style layout for Scenario Plan.
- Standalone approval, task or capability admin screens in first version.
- Showing model conclusions without source cards.

## Design Acceptance

- A user can trace a signal from market intent to evidence to matched theory/rule.
- A user can distinguish signal lifecycle status from content tags.
- A user can identify which sources and tools influenced an Agent answer.
- A user can see stale/fallback state without losing the last useful data.
- A user cannot mistake Scenario Plan for an executable order.

## Tests

- Visual screenshot review for dashboard, signal detail, chat and learning states.
- Accessibility check for tag contrast and table keyboard selection.
- Component tests for tag/status combinations.
