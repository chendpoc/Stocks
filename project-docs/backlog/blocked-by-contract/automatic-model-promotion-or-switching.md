# Automatic Model Promotion Or Switching

Status: Blocked by Contract

## Blocker

Stage 1 only allows recommendations; automatic switching is unsafe without a
registry and promotion gate.

## Required Contract Or Gate

Model registry, PromotionGate, shadow-mode metrics, rollback policy.

## Boundary

No graph, CLI command, or backend endpoint may silently switch active models.

## Unblock Step

Implement model registry and promotion policy after challenger evaluation is
available.
