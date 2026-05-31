---
paths: "docs/**/plans/*.md"
---

# Plan and worker prompt conventions

Load when writing implementation plans or worker prompts.

## Specification gate

The specification gate checklist is defined in `00-workflow-router.md` §4. Read it there before writing any plan.

### Behavior preserved — the principle

When a new module replaces or wraps an old module, the burden of proof is on the new code. Do not start from "the new code handles the happy path, close enough." Start from:

> "The old code's input parsing, query construction, result assembly, and edge case handling each exist for a reason. I must account for every one."

Account = one of:
- **Kept** → new code replicates the behavior (same algorithm or improved equivalent)
- **Enhanced** → new code improves on it, documented in decisions as conscious upgrade
- **Removed** → new code drops it, documented in decisions with rationale

Anything unaccounted is a regression. The default is not "close enough" — it's "prove equivalence."

This one principle covers all migration error classes: search matching, sorting, filtering, snippet generation, error handling, parameter validation. No need for a new checklist item per bug.

## Documentation chain

```
PRD → dev doc (01-07-*.md) → plan (plans/XX-mX-*.md) → worker prompt (plans/XX-mX-worker-prompt.md)
```

- If a phase has no dev doc, flag it before writing the plan.
- Worker prompts are separate files, never embedded in the plan.
- Each layer adds detail without repeating the previous layer.

## Plan structure

Every plan must contain:
- Source-of-truth links
- Confirmed decisions with "why"
- Allowed / forbidden files
- Test table with setup / assertion
- Acceptance-to-verification map
- Verification commands (copy-pasteable)

## Worker prompt structure

Every worker prompt is a self-contained `.md` file. It must include:
- Goal and repository root
- Context: what already exists (tables, modules, their roles)
- Confirmed decisions (do not deviate)
- Allowed / forbidden files
- Implementation tasks with concrete code snippets where applicable
- Required tests with setup/assertion
- Verification commands
- "Do not commit" instruction
