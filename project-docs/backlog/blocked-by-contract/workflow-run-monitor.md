# Cross-System Workflow Run Monitor

Status: Blocked by Contract

## Current Replacement

Local `Stage1Runtime` run monitoring is already covered by
[`Run Monitor`](../now/run-monitor.md) through T017 runtime observability. This
blocked item is only for a cross-system monitor that joins workflow runtime,
backend Agent Core lifecycle, and shared platform events.

## Blocker

The cross-system monitor contract is not defined yet.

## Required Contract Or Gate

Shared Platform workflow runtime contract plus Agent Core run lifecycle.

## Boundary

Do not implement the cross-system monitor before run identity, lifecycle,
event, retry, and resume semantics are stable across workflow runtime, Agent
Core, and the shared platform event stream. Do not treat the T017 local read
model as permission to add backend `agent_events`, scheduling, retry, approval,
or workflow management controls.

## Unblock Step

Define the cross-system run monitor contract and align workflow runtime,
backend Agent Core lifecycle, and shared platform event semantics.
