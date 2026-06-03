# Task Scheduling

Status: Blocked by Contract

## Blocker

Scheduler ownership, run durability, failure policy, and retry semantics need a
platform contract.

## Required Contract Or Gate

Shared Platform task/runtime contract.

## Boundary

Do not add ad hoc scheduling into individual graphs or CLI commands.

## Unblock Step

Decide scheduler ownership and define durable run creation, retry, and failure
semantics.
