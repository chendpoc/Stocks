# T004 trader-chart-ratatui — Slice Prompts

严格串行：P0 → R1 → … → R8 → T1 → T2 → T3 → T4 → G。

| Slice | Gate |
|-------|------|
| P0 | spec + decision + 本 README |
| R1–R8 | `cargo test -p trader-chart` |
| T1–T4 | `npm test`（trader-cli） |
| G | V201 + V202 + 手工 V203 |

Spec: `.agent-dev/specs/trader-chart-ratatui/`
