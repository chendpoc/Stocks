# Workflow Run Detail Viewer

Status: Blocked by Contract

## Blocker

Run history, node state, retry/resume, and audit event contract are not stable
yet.

## Required Contract Or Gate

Workflow run schema and event stream contract.

## Boundary

Do not design detailed replay or node-level controls until the read model is
stable.

## Unblock Step

Specify the run detail read model and audit event shape.
