# Ratatui 全屏 K 线 + Ink Handoff

## 背景

Ink Dashboard 内 asciichart 仅适合预览；完整 OHLCV 交互由 Rust `trader-chart`（ratatui + tokio）在同终端 handoff 提供。

## 决策

- **D201**：unmount Ink → `spawnSync` inherit → relaunch Ink
- **D202**：Dashboard 保留 asciichart，`[c]` 进全屏
- **D203**：消费 `GET /market/bars?chart=`

## 验收

- `cargo test -p trader-chart`
- `cd apps/trader-cli && npm test`
- 手工：`[c]` / `q` 往返，周期与标的保持
