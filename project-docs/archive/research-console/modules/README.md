# Legacy Module Docs

This directory stores historical module plans and PRDs from the old
research-console route. It is not the current trader-agent source-of-truth.

## When To Read

Read these files only when:

- migrating a known old module into the target trader-agent system;
- reviewing historical research-console behavior;
- preserving or updating a test that explicitly references one of these docs.

## When Not To Read

Do not read this directory for:

- ordinary trader-agent implementation;
- current roadmap decisions;
- current workflow orchestration decisions;
- alpha research or corpus analysis unless a route explicitly asks for a legacy
  module.

## Rules

- Do not add new active plans here.
- New implementation tasks belong in `.agent-dev/specs/**` and
  `.agent-dev/tasks/**`.
- Current product direction belongs under
  `project-docs/research-agent/target-system/trader-agent/`.
- Keep historical file paths stable unless a dedicated migration updates tests
  and references together.
