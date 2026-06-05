# T018: LiveMarketDataPlane Implementation v0

Status: done

Spec: `.agent-dev/specs/live-market-data-plane-implementation-v0/spec.json`

Depends on: T015 contract, T016 confirmed gate.

## Goal

Implement read-only M2: ingest/normalize/store quote facts, build
`MarketStateSnapshot` with `consumer_readiness`, expose backend APIs and CLI
inspection. No orders, paper engine, or broker paths.

## Verification

```text
cd apps/trader-agent/backend && python -m pytest tests/test_live_market_plane.py -v --tb=short
```

## Outcome

M2 v0 implemented: Longbridge/fixture quote ingest → `QuoteSnapshot` →
`MarketStateSnapshot` with `consumer_readiness`, persisted in `market_intel.db`,
exposed via `/api/market-plane` and `trader market-plane` CLI.

## Evidence

| ID | Command | Exit | Result |
|---|---|---|---|
| V601 | `python -m pytest tests/test_live_market_plane.py tests/test_live_market_plane_ws.py -v --tb=short` | 0 | 6 passed |

## Longbridge WebSocket（模拟盘）

1. 安装可选依赖：`pip install -e ".[longbridge]"`（在 `apps/trader-agent/backend`）
2. 在 [Longbridge 开放平台](https://open.longbridge.com/) 启用**模拟账户**，将 **模拟盘 Access Token** 写入环境变量（与实盘 Token 不同；行情权限随 App Key，交易权限随 Token）：
   - `LONGBRIDGE_APP_KEY`
   - `LONGBRIDGE_APP_SECRET`
   - `LONGBRIDGE_ACCESS_TOKEN` ← 模拟盘 token
3. 启动 backend 后：
   - `POST /api/market-plane/stream/start` 订阅 `TSLA.US` 等 M2 标的的 Quote/Depth/Trade 推送
   - `GET /api/market-plane/stream/status` 查看连接与 push 计数
   - `POST /api/market-plane/stream/stop` 停止
4. CLI：`trader market-plane stream-start` / `stream-status` / `stream-stop`

推送会写入 `market_intel.db` 并刷新 `MarketStateSnapshot`；当 depth + trade 齐备时 `consumer_readiness.paper_simulation` 可为 `ready`。
