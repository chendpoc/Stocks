# Broker Mirror

Status: Blocked by Contract

## Blocker

Requires broker account model, order/fill sync, position/PnL state, and
permission model.

## Required Contract Or Gate

Broker mirror PRD and integration contract.

## Boundary

Do not add broker mirror assumptions to research workflows or CLI/TUI surfaces.

## Unblock Step

Write a dedicated broker mirror PRD with sync, permission, reconciliation, and
failure semantics.
