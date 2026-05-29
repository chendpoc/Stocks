# Image2 Prompt | Dashboard Reference Page Quality Reset

Use this prompt to generate a visual design sketch for `/cockpit/dashboard/live`.

## Prompt

Create a high-fidelity product UI concept image for a desktop web app page.

Product: Agent Market Cockpit, a personal quant market observation command surface.

Route: `/cockpit/dashboard/live`.

Target viewport: 1440x900 desktop. Also keep the layout viable at 1280x720 compact desktop.

Design goal: make the page feel like a serious financial market command surface, not a generic SaaS dashboard. It should be dense, calm, professional, table-first, evidence-oriented and agent-aware.

Main user behavior: the user opens the dashboard to understand today's market state, market intent, attention priorities and why each focus item matters. The user can open a right drawer to inspect one focus item without leaving the page.

Layout requirements:

1. Left sidebar:
   - fixed width
   - product identity at top
   - active market context selector
   - primary navigation
   - compact read-only runtime status at bottom
   - no account avatar, notification icon or help icon

2. Main header:
   - page title: 实时市场总控 / Live Market Command
   - active symbol chip such as SPY
   - data freshness
   - refresh button
   - search input
   - compact, one-line, no decorative chrome

3. L1 status row:
   - four balanced compact cards
   - Market Gate
   - Open Signals
   - Invalidated
   - Data Freshness
   - equal visual weight, no tall oversized card

4. L2 Market Intent Strip:
   - a compact horizontal strip, not a large card
   - concise market intent summary
   - why wait / why now chips
   - next watch condition
   - evidence count
   - should not dominate the page

5. L3 Today Focus Queue:
   - primary visual anchor of the page
   - dense table layout
   - sticky header
   - nowrap table headers
   - local table body scroll if needed
   - filters above table: search, type, status, semantic tag chips
   - columns: Type, Status, Priority, Symbol, Title/Summary, Reason, Updated, Actions
   - visible row actions: 查看, 本地关注, 忽略
   - row click or 查看 opens right drawer

6. Right drawer:
   - open state should be visible in the sketch
   - title and symbol
   - semantic tags
   - reason
   - trigger conditions
   - invalidation conditions
   - evidence list
   - related Agent nodes
   - drawer body scrolls internally
   - not an order form, no trade execution language

Visual style:

- dark or near-dark professional cockpit theme
- semantic accents: green for market intent, amber/red for risk or opportunity, blue for rule/learning
- compact typography, strong alignment, stable spacing
- low radius, restrained shadows, no decorative gradient blobs
- dense but not chaotic
- use subtle separators and table structure
- no marketing hero layout
- no large empty decorative panels

Hard exclusions:

- no trading execution
- no order ticket
- no approval center
- no scheduler/task admin
- no rule editor
- no account trading controls
- no generic SaaS account avatar or notification cluster

The image should communicate layout, hierarchy, density and interaction model. It should not be a code screenshot.

## Review Checklist

After generation, review:

- Does Today Focus Queue dominate the page?
- Is Market Intent Strip compact?
- Are L1 cards balanced?
- Are row actions visible?
- Does drawer detail feel connected to the selected row?
- Does the page avoid generic SaaS chrome?
- Is the sidebar useful but not visually dominant?
- Would the page still make sense at 1280x720?
