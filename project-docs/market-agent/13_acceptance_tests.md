# 13. Acceptance Tests

> **⚠️ 测试分层**:
>   Unit — TypeScript mock, <1s 单函数验证
>   Integration — TypeScript → fixture FastAPI → 内存 SQLite, ~5s 跨语言链路
>   E2E — Playwright CLI 测试, 手动/CI 可选
> 集成测试通过 `test/fixtureServer.ts` 启动 Python FastAPI 子进程。

> **⚠️**: 测试目录沿用现有结构:
> - Workflow tests: `apps/trader-workflows/src/**/*.test.ts`
> - Backend tests: `apps/trader-agent/backend/tests/`
> 新增表测试写到对应已有测试目录，不新建独立 market-agent 测试根目录。

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的系统级验收测试。

本系统不是单点功能集合，而是一个完整闭环：

```text
行情数据
  ↓
数据质量检查
  ↓
特征计算
  ↓
setup 检测
  ↓
DecisionEnvelope
  ↓
永久记忆
  ↓
结果回标
  ↓
评估统计
  ↓
规律候选
  ↓
PatternMemory
  ↓
Context Pack
  ↓
下一次 CLI 启动恢复长期记忆
```

验收测试必须证明：

```text
1. 系统可以跑通最小闭环。
2. 所有关键数据都能落库。
3. 所有关键规则都能被测试验证。
4. 数据失败时系统会安全降级。
5. 用户确认门禁有效。
6. CLI 启动时能恢复长期记忆。
```

---

## 2. 验收测试原则

### 2.1 不依赖真实行情 API

验收测试默认使用 mock 数据，不依赖实时 API。

原因：

```text
1. 实时 API 不稳定。
2. 数据源可能限流。
3. 市场不开盘时测试不可控。
4. 测试需要确定性结果。
```

允许单独保留 integration smoke test 连接真实 API，但不得作为核心 CI 验收条件。

---

### 2.2 所有关键路径必须可重复运行

验收测试必须满足：

```text
1. 可重复运行。
2. 不依赖运行顺序以外的隐式状态。
3. 不破坏已有数据库。
4. 可使用临时 SQLite 数据库。
5. 测试完成后可清理。
```

---

### 2.3 安全边界必须测试

必须验证：

```text
1. monitor_only 模式不输出 live_order。
2. promote-pattern 未确认时失败。
3. 数据质量 failed / blocked 时不进入 setup detection。
4. source_conflict blocked 时不生成 alert。
5. degraded pattern 不作为高置信正向信号。
```

---

## 3. 最小系统闭环验收

## 3.1 目标

验证从初始化数据库到生成 context pack 的完整链路。

---

## 3.2 验收链路

```text
npm run workflows -- memory init
  ↓
npm run workflows -- context bootstrap --profile default
  ↓
npm run workflows -- market-monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
  ↓
生成 DecisionEnvelope
  ↓
写入 `model_decisions`（概念名：decision_memories）
  ↓
npm run workflows -- outcomes run --due --window 2h
  ↓
写入 `decision_outcomes` / `insight_candidate_outcomes`（概念名：outcome_memories）
  ↓
npm run workflows -- eval summary --setup VWAP_RECLAIM --window 2h
  ↓
生成 EvaluationResult
  ↓
npm run workflows -- insights explore --setup VWAP_RECLAIM --symbol TSLA
  ↓
生成 insight_candidate
  ↓
npm run workflows -- pattern-memory promote --candidate-id insight_001 --confirm
  ↓
写入 pattern_memories
  ↓
npm run workflows -- context bootstrap --profile default
  ↓
context_pack.md 包含 active pattern
```

---

## 3.3 验收标准

必须满足：

```text
1. 所有命令执行成功。
2. 所有关键表有数据写入。
3. DecisionEnvelope 可以被查询。
4. OutcomeMemory 可以被查询。
5. EvaluationResult 可以生成。
6. InsightCandidate 可以生成。
7. PatternMemory 可以晋升。
8. ContextPack 可以重新生成。
9. 新晋升的 active pattern 出现在 context_pack.md。
10. 整个流程不出现 live_order。
```

---

## 4. 数据库验收测试

## 4.1 测试目标

验证永久记忆数据库 schema 和 repository 可用。

---

## 4.2 必须测试

```text
test_memory_init_creates_all_tables
test_memory_init_is_idempotent
test_market_snapshot_repository_create_and_get
test_feature_snapshot_repository_create_and_get
test_setup_event_repository_create_and_get
test_decision_memory_repository_create_and_get
test_outcome_memory_repository_create_and_get
test_insight_candidate_repository_create_and_get
test_pattern_memory_repository_create_and_get
test_failure_memory_repository_create_and_get
test_session_context_pack_repository_create_and_get_latest
```

---

## 4.3 验收标准

```text
1. 所有表可创建。
2. 所有索引可创建。
3. migration 可重复运行。
4. repository 支持 create / get / list / update。
5. 不破坏已有 workflow recording。
6. SQLite 临时数据库测试通过。
```

---

## 5. MarketDataService 验收测试

## 5.1 测试目标

验证行情服务可以统一处理 Longbridge / Alpha Vantage / yfinance，并输出标准化 `MarketDataResponse`。

---

## 5.2 必须测试

```text
test_source_router_realtime_priority
test_source_router_historical_daily_priority
test_source_router_preferred_source
test_market_data_service_fetch_success
test_market_data_service_fallback_on_primary_failure
test_market_data_service_no_fallback_when_disabled
test_market_data_service_writes_market_bars
test_market_data_response_contains_quality_report
```

---

## 5.3 Mock 场景

至少准备：

```text
1. Longbridge 正常返回 5m 数据。
2. Longbridge 失败，Alpha Vantage fallback 成功。
3. Alpha Vantage 限流。
4. yfinance 作为 fallback。
5. 所有数据源失败。
```

---

## 5.4 验收标准

```text
1. MarketDataService 不暴露数据源私有结构给上层。
2. 返回标准 OHLCVBar。
3. fallback 行为正确。
4. failed / blocked 状态可被识别。
5. `market_bars` 有写入（概念名：market_snapshots）。
```

---

## 6. DataQualityGate 验收测试

## 6.1 测试目标

验证数据质量门禁能阻止脏数据进入 setup detection。

---

## 6.2 必须测试

```text
test_quality_gate_empty_bars_failed
test_quality_gate_duplicate_timestamp_warning
test_quality_gate_out_of_order_warning
test_quality_gate_abnormal_ohlc_blocked
test_quality_gate_zero_volume_warning
test_quality_gate_stale_realtime_failed
test_quality_gate_source_conflict_warning
test_quality_gate_source_conflict_blocked
```

---

## 6.3 验收标准

```text
1. empty bars → failed。
2. 严重 OHLC 异常 → blocked。
3. 实时数据过期 → failed。
4. source conflict 超过阈值 → blocked。
5. failed / blocked 不允许进入 setup detection。
```

---

## 7. FeatureEngine 验收测试

## 7.1 测试目标

验证特征计算稳定、可复现、可落库。

---

## 7.2 必须测试

```text
test_feature_engine_compute_vwap
test_feature_engine_compute_ema_9_20_50
test_feature_engine_compute_atr
test_feature_engine_compute_volume_ratio
test_feature_engine_compute_gap_pct
test_feature_engine_compute_relative_strength_spy
test_feature_engine_compute_relative_strength_qqq
test_feature_engine_blocks_on_failed_quality
test_feature_engine_writes_feature_snapshot
```

---

## 7.3 验收标准

```text
1. 特征计算结果与固定样例一致。
2. 数据质量 failed / blocked 时不生成常规 feature。
3. feature_snapshots 可以写入数据库。
4. LLM 不参与特征计算。
```

---

## 8. DecisionEnvelope 验收测试

## 8.1 测试目标

验证系统核心输出对象合法、可序列化、可落库、可回标。

---

## 8.2 必须测试

```text
test_decision_envelope_valid_watch
test_decision_envelope_valid_alert
test_decision_envelope_valid_blocked
test_decision_envelope_valid_invalidated
test_decision_envelope_requires_evidence_for_non_ignore
test_decision_envelope_requires_invalidation_conditions
test_decision_envelope_confidence_range
test_decision_envelope_action_enum
test_decision_envelope_status_enum
test_decision_envelope_monitor_only_blocks_paper_candidate
test_decision_envelope_never_outputs_live_order_in_mvp
test_decision_envelope_maps_to_decision_memory
test_decision_envelope_json_serializable
```

---

## 8.3 验收标准

```text
1. 非 ignore 判断必须有 supporting_evidence。
2. 非 ignore 判断必须有 invalidation_conditions。
3. confidence 必须在 0.0 - 1.0。
4. monitor_only 模式不能输出 paper_trade_candidate。
5. MVP 阶段不能输出 live_order。
6. DecisionEnvelope 可写入 `model_decisions`（概念名：decision_memories）。
```

---

## 9. MarketMonitorGraph 验收测试

## 9.1 测试目标

验证实时监控工作流可以从行情数据生成结构化判断并落库。

---

## 9.2 必须测试

```text
test_market_monitor_load_default_mandate
test_market_monitor_load_watchlist
test_market_monitor_handles_missing_context_pack
test_market_monitor_fetches_market_data
test_market_monitor_blocks_on_data_quality_failed
test_market_monitor_computes_features_on_warning_quality
test_market_monitor_detects_vwap_reclaim_forming
test_market_monitor_detects_vwap_reclaim_invalidated
test_market_monitor_detects_relative_strength_pullback
test_market_monitor_detects_opening_range_breakout
test_market_monitor_generates_evidence_graph
test_market_monitor_generates_contra_case
test_market_monitor_applies_risk_gate_blocked
test_market_monitor_generates_decision_envelope
test_market_monitor_persists_decision_memory
test_market_monitor_does_not_output_live_order
```

---

## 9.3 Mock 行情场景

必须准备以下固定行情样例：

```text
1. TSLA VWAP reclaim forming。
2. TSLA VWAP reclaim confirmed。
3. TSLA VWAP reclaim invalidated。
4. NVDA relative strength pullback。
5. AAPL opening range breakout。
6. QQQ risk_off。
7. data_quality_failed。
8. source_conflict blocked。
```

---

## 9.4 验收标准

```text
1. `npm run workflows -- market-monitor run` 可执行。
2. 可以生成 DecisionEnvelope。
3. 所有 DecisionEnvelope 都写入 `model_decisions`（概念名：decision_memories）。
4. 数据质量 failed / blocked 时不进入 setup detection。
5. 风控 blocked 时 action = blocked。
6. MVP 阶段不输出 live_order。
```

---

## 10. OutcomeGraph 验收测试

## 10.1 测试目标

验证系统可以对历史判断进行后续结果回标。

---

## 10.2 必须测试

```text
test_outcome_load_unlabeled_decisions
test_outcome_resolve_30m_window
test_outcome_resolve_2h_window
test_outcome_resolve_1d_window
test_outcome_fetch_future_price_window
test_outcome_compute_reference_price
test_outcome_compute_mfe_mae_long_bias
test_outcome_hit_entry_true
test_outcome_hit_entry_false
test_outcome_hit_invalidation_true
test_outcome_label_good_watch_signal
test_outcome_label_false_positive
test_outcome_label_invalidated_quickly
test_outcome_label_blocked_correctly
test_outcome_label_missed_opportunity
test_outcome_label_unknown_on_missing_data
test_outcome_persist_memory
```

---

## 10.3 验收标准

```text
1. 可以读取未回标 decisions。
2. 可以解析 30m / 2h / 1d 窗口。
3. 可以计算 MFE / MAE / final_return。
4. 可以判断 hit_entry / hit_invalidation。
5. 可以生成 outcome_label。
6. 可以写入 `decision_outcomes` / `insight_candidate_outcomes`（概念名：outcome_memories）。
7. 缺数据时 outcome_label = unknown。
8. 所有计算不依赖 LLM。
```

---

## 11. EvaluationGraph 验收测试

## 11.1 测试目标

验证系统可以统计 setup / pattern 表现，并生成规律候选。

---

## 11.2 必须测试

```text
test_evaluation_group_by_symbol_setup
test_evaluation_group_by_timeframe
test_evaluation_compute_sample_size
test_evaluation_compute_good_signal_rate
test_evaluation_compute_false_positive_rate
test_evaluation_compute_invalidation_rate
test_evaluation_compute_median_mfe_mae
test_evaluation_compute_mean_final_return
test_evaluation_detect_recent_degradation
test_evaluation_generate_positive_insight_candidate
test_evaluation_generate_negative_insight_candidate
test_evaluation_persist_insight_candidate
```

---

## 11.3 验收标准

```text
1. 可以按 symbol / setup / timeframe / window 聚合。
2. 可以计算 sample_size。
3. 可以计算 good_signal_rate。
4. 可以计算 false_positive_rate。
5. 可以计算 invalidation_rate。
6. 可以计算 median_mfe / median_mae。
7. 可以识别 recent_degradation。
8. 可以生成 insight_candidate。
9. insight_candidate 默认 status = new。
10. 不自动晋升 active pattern。
```

---

## 12. PatternMemory 验收测试

## 12.1 测试目标

验证规律候选可以经过确认后进入长期规律库，并支持状态机。

---

## 12.2 必须测试

```text
test_create_insight_candidate
test_insight_candidate_status_new
test_insight_candidate_mark_testing
test_insight_candidate_mark_rejected
test_insight_candidate_mark_promoted
test_candidate_cannot_promote_without_confirmation
test_candidate_cannot_promote_without_evidence
test_candidate_promotes_to_active_with_confirmation
test_create_pattern_memory
test_pattern_status_candidate
test_pattern_status_testing
test_pattern_status_active
test_pattern_status_degraded
test_pattern_status_invalidated
test_pattern_status_archived
test_list_active_patterns_by_symbol
test_list_degraded_patterns_by_symbol
test_update_pattern_status
test_update_pattern_performance
```

---

## 12.3 验收标准

```text
1. insight_candidate 默认不是 active pattern。
2. 未确认不能 promote active。
3. 用户确认后可以写入 pattern_memories。
4. pattern 支持 candidate / testing / active / degraded / invalidated / archived。
5. active pattern 可查询。
6. degraded pattern 可查询。
7. archived pattern 默认不进入 context_pack。
```

---

## 13. FailureMemory 验收测试

## 13.1 测试目标

验证失败教训可以被保存、查询、进入 context pack。

---

## 13.2 必须测试

```text
test_create_failure_memory
test_failure_memory_required_fields
test_list_active_warnings
test_list_failures_by_symbol
test_list_failures_by_setup
test_resolve_failure_memory
test_archive_failure_memory
test_failure_memory_enters_context_pack
test_resolved_failure_not_in_context_pack
test_archived_failure_not_in_context_pack
```

---

## 13.3 验收标准

```text
1. active_warning 可以保存。
2. active_warning 可以查询。
3. active_warning 必须进入 context_pack。
4. resolved / archived 默认不进入 context_pack。
```

---

## 14. SessionContextBootstrap 验收测试

## 14.1 测试目标

验证 CLI 启动上下文包可以正确生成，并恢复长期记忆。

---

## 14.2 必须测试

```text
test_context_pack_loads_trading_mandate
test_context_pack_loads_watchlist
test_context_pack_loads_active_patterns
test_context_pack_loads_degraded_patterns
test_context_pack_loads_active_warnings
test_context_pack_loads_recent_decisions
test_context_pack_limits_active_patterns
test_context_pack_limits_recent_decisions
test_context_pack_renders_required_behavior
test_context_pack_renders_prohibited_behavior
test_context_pack_records_source_memory_ids
test_context_pack_writes_file
test_context_pack_persists_session_context_pack
test_context_pack_handles_empty_patterns
test_context_pack_handles_empty_failures
test_context_pack_handles_empty_recent_decisions
```

---

## 14.3 验收标准

```text
1. `npm run workflows -- context bootstrap --profile default` 可执行。
2. .runtime/context/context_pack.md 被生成。
3. context_pack 包含 Trading Mandate。
4. context_pack 包含 Watchlist。
5. context_pack 包含 Active Patterns。
6. context_pack 包含 Degraded Patterns。
7. context_pack 包含 Active Warnings。
8. context_pack 包含 Recent Decisions。
9. context_pack 包含 Required Behavior。
10. context_pack 包含 Prohibited Behavior。
11. session_context_packs 有写入。
12. source_memory_ids_json 可追溯。
13. 空数据状态下也能生成安全默认 context pack。
```

---

## 15. API / CLI 验收测试

## 15.1 CLI 测试

必须覆盖：

```text
test_cli_memory_init
test_cli_memory_bootstrap
test_cli_memory_context_latest
test_cli_monitor_run
test_cli_memory_decisions
test_cli_label_outcomes
test_cli_evaluate
test_cli_generate_insights
test_cli_promote_pattern_requires_confirmation
test_cli_promote_pattern_with_confirmation
test_cli_patterns_list_active
test_cli_failures_list_active_warning
test_cli_market_data_fetch
test_cli_market_data_health
```

---

## 15.2 API 测试

必须覆盖：

```text
test_api_market_data_fetch
test_api_market_data_health
test_api_market_monitor_run
test_api_list_decisions
test_api_label_outcome
test_api_label_outcome_batch
test_api_evaluate
test_api_generate_insight
test_api_list_patterns
test_api_promote_pattern_requires_confirmation
test_api_promote_pattern_with_confirmation
test_api_build_context_pack
test_api_latest_context_pack
```

---

## 15.3 验收标准

```text
1. 所有关键 CLI 命令可执行。
2. 所有关键 API 可调用。
3. --json 输出可被解析。
4. promote-pattern 未确认时被拒绝。
5. monitor run 不输出 live_order。
6. API 错误结构统一。
```

---

## 16. 安全验收测试

## 16.1 测试目标

验证系统不会在 MVP 阶段越权。

---

## 16.2 必须测试

```text
test_monitor_only_blocks_paper_trade_candidate
test_monitor_only_blocks_live_order
test_live_order_not_supported_in_mvp
test_promote_pattern_requires_user_confirmation
test_data_quality_failed_blocks_setup_detection
test_source_conflict_blocks_alert
test_degraded_pattern_cannot_be_high_confidence_positive_evidence
test_candidate_pattern_cannot_enter_active_context
test_llm_cannot_write_market_snapshot
test_llm_cannot_compute_mfe_mae
```

---

## 16.3 验收标准

```text
1. MVP 永远不输出 live_order。
2. 用户未确认不能 promote active pattern。
3. 数据质量失败必须阻断 setup detection。
4. source_conflict 必须阻断 alert。
5. LLM 不参与确定性计算。
```

---

## 17. 最小端到端验收测试

## 17.1 测试名称

```text
test_e2e_permanent_memory_market_agent_minimal_loop
```

---

## 17.2 测试流程

```text
1. 使用临时 SQLite 初始化数据库。
2. 写入 mock market data。
3. 运行 `npm run workflows -- memory init`。
4. 运行 `npm run workflows -- context bootstrap`。
5. 运行 `npm run workflows -- market-monitor run`。
6. 验证生成 DecisionEnvelope。
7. 验证 `model_decisions` 有写入（概念名：decision_memories）。
8. 运行 `npm run workflows -- outcomes run --due --window 2h`。
9. 验证 `decision_outcomes` / `insight_candidate_outcomes` 有写入（概念名：outcome_memories）。
10. 运行 `npm run workflows -- eval summary`。
11. 验证 EvaluationResult 生成。
12. 运行 `npm run workflows -- insights explore`。
13. 验证 insight_candidate 生成。
14. 运行 `npm run workflows -- pattern-memory promote --confirm`。
15. 验证 pattern_memories 有 active pattern。
16. 再次运行 `npm run workflows -- context bootstrap`。
17. 验证 context_pack.md 包含 active pattern。
```

---

## 17.3 验收标准

```text
1. E2E 测试全程通过。
2. 中间所有数据可查询。
3. context_pack 包含新规律。
4. 系统不输出 live_order。
5. 所有行为在 monitor_only 安全边界内。
```

---

## 18. 推荐测试目录结构

```text
apps/trader-agent/backend/tests/
  test_market_agent_memory_schema.py
  test_market_agent_market_data_service.py
  test_market_agent_data_quality_gate.py
  test_market_agent_feature_engine.py
  test_market_agent_pattern_memory.py
  test_market_agent_failure_memory.py
  test_market_agent_context_pack_builder.py
  test_market_agent_api_routes.py
  test_market_agent_safety_constraints.py

apps/trader-workflows/src/
  graphs/**/<market-agent-workflow>.test.ts
  services/<market-agent-service>.test.ts
  index.test.ts
```

---

## 19. Mock 数据目录建议

```text
apps/trader-agent/backend/tests/
  fixtures/
    market_agent/
      tsla_vwap_reclaim_forming.json
      tsla_vwap_reclaim_confirmed.json
      tsla_vwap_reclaim_invalidated.json
      nvda_relative_strength_pullback.json
      aapl_opening_range_breakout.json
      qqq_risk_off.json
      data_quality_failed.json
      source_conflict.json
      outcome_good_watch_signal.json
      outcome_false_positive.json
      outcome_invalidated_quickly.json
```

---

## 20. CI 验收命令

Backend 验收命令：

```bash
.venv/Scripts/python.exe -m pytest apps/trader-agent/backend/tests/test_market_agent_*.py -v --tb=short
```

Workflow / CLI 验收命令：

```bash
cd apps/trader-workflows && npm test
```

---

## 21. 完成定义

本验收文档完成后，开发 Agent 应能明确：

```text
1. 每个模块必须测试什么。
2. 哪些行为是系统级必测。
3. 哪些安全边界必须强制。
4. 如何验证永久记忆闭环已经跑通。
5. 如何避免系统退化成一次性行情解释器。
```

本项目只有在以下条件全部满足后，才算完成 MVP：

```text
1. Memory schema 可用。
2. MarketDataService 可用。
3. MarketMonitorGraph 可生成 DecisionEnvelope。
4. DecisionEnvelope 可永久落库。
5. OutcomeGraph 可回标。
6. EvaluationGraph 可统计。
7. InsightCandidate 可生成。
8. PatternMemory 可晋升。
9. FailureMemory 可进入 context pack。
10. SessionContextBootstrap 可恢复长期记忆。
11. CLI / API 可调用。
12. 安全约束测试通过。
13. E2E 最小闭环测试通过。
```
