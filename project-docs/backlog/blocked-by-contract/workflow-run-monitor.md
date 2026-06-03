# Cross-System Workflow Run Monitor

Status: Blocked by Contract

## Blocker

No canonical workflow definition and run schema yet.

## Required Contract Or Gate

Shared Platform workflow runtime contract plus Agent Core run lifecycle.

## Boundary

Do not implement the cross-system monitor before run identity, lifecycle,
event, retry, and resume semantics are stable across workflow runtime and Agent
Core. A minimal `apps/trader-workflows` run monitor can still proceed under the
Now backlog.

## Unblock Step

Define the workflow run contract and align it with current `apps/trader-workflows`
runtime behavior.
