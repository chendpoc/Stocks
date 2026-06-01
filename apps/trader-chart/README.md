# trader-chart

Ratatui 全屏 OHLCV K 线（方案 A），由 Ink Dashboard `[c]` 或 `trader chart SYMBOL` 启动。

## 构建

```bash
# 仓库根目录
npm run trader-chart:build
# 或
cargo build -p trader-chart --release
```

二进制：`target/release/trader-chart.exe`（Windows）或 `target/release/trader-chart`。

## 环境

| 变量 | 默认 |
|------|------|
| `TRADER_API_BASE` | `http://127.0.0.1:8000/api/intel` |
| `TRADER_CHART_BIN` | （由 trader-cli 解析 release/debug 路径） |
| `TRADER_CHART_HANDOFF` | `.cache/trader-cli/chart-handoff.json` |

需先启动 `npm run trader-agent:backend:dev`。

## 快捷键

`q` 退出 · `[]` 周期 · `x` 标的模式 · `←→`/`hl` 换标的 · `jk`/`↑↓` 十字线 · `+/-` 缩放 · `f` 刷新 · `i` ingest · `/` 搜索标的

## 测试

```bash
cargo test -p trader-chart
```
