# 01. System Goal and Scope

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的系统目标、开发边界、成功标准、用户确认门禁和失败处理原则。

本系统不是一次性股票分析工具，而是一个长期运行的金融市场研究 Agent。它需要持续监控市场、记录判断、回标结果、总结规律，并在每次 CLI 会话启动时恢复历史经验。

---

## 2. 系统一句话目标

构建一个具备永久记忆能力的本地金融市场监控 Agent：

> 系统能够对固定股票池进行实时监控和历史规律分析，将行情数据、特征、setup、决策、结果、失败教训和规律总结持久化存储，并在每次 CLI 启动时自动加载已验证规律、失败教训和风险边界。

---

## 3. 核心用户目标

用户希望系统做到：

1. 长期监控指定股票池。
2. 识别市场状态和潜在 setup。
3. 给出结构化、可验证的市场判断。
4. 保存每次判断和判断依据。
5. 追踪判断后续结果。
6. 从历史判断中总结有效规律。
7. 识别已经失效或表现衰退的规律。
8. 每次打开 CLI 时仍然记得过去学习到的内容。
9. 不依赖聊天历史，而依赖本地永久记忆系统。
10. 不自动实盘交易，所有高风险动作必须经过用户确认。

---

## 4. 系统能力范围

### 4.1 MVP 需要支持

MVP 阶段必须支持：

```text
1. 固定股票池监控
2. 多数据源行情获取
3. 数据质量检查
4. 基础特征计算
5. 三类 setup 检测
6. DecisionEnvelope 生成
7. 决策永久落库
8. 结果回标
9. 规律候选生成
10. 规律记忆保存
11. 失败记忆保存
12. CLI context_pack 生成
```

---

### 4.2 MVP 股票池

MVP 固定监控：

```text
SPY
QQQ
TSLA
NVDA
AAPL
```

后续扩展：

```text
COIN
BMNR
用户自定义 watchlist
```

---

### 4.3 MVP 时间周期

MVP 使用：

```text
5m
1d
```

用途：

```text
5m：日内 setup 检测
1d：中期趋势和历史上下文
```

暂不做：

```text
tick 数据
1s 高频数据
全市场扫描
复杂期权链
自动下单
```

---

### 4.4 MVP Setup

MVP 先实现 3 类 setup：

```text
VWAP_RECLAIM
RELATIVE_STRENGTH_PULLBACK
OPENING_RANGE_BREAKOUT
```

后续扩展：

```text
GAP_HOLD
GAP_FADE
DAILY_BREAKOUT_RETEST
FAILED_BREAKOUT
PANIC_RECOVERY
EARNINGS_GAP_FOLLOW_THROUGH
```

---

## 5. 非目标

本阶段明确不做：

```text
1. 不做自动实盘交易。
2. 不做自动下单。
3. 不做收益承诺。
4. 不做不可审计的黑箱预测。
5. 不做全市场扫描。
6. 不做高频交易。
7. 不做复杂深度学习训练。
8. 不做期权 Greeks 复杂定价。
9. 不把 30 年原始数据塞进 LLM 上下文。
10. 不让 LLM 直接决定交易动作。
11. 不让一次成功案例升级为永久有效规律。
12. 不允许系统自动绕过风控。
```

---

## 6. 核心设计边界

### 6.1 LLM 不负责长期记忆

错误做法：

```text
让 LLM 记住所有历史规律
把所有历史数据塞进 prompt
依赖聊天上下文延续
```

正确做法：

```text
数据库 / 数据湖 / 特征库 / 规律库负责长期记忆
LLM 只负责读取、解释、总结、反证和生成假设
```

---

### 6.2 LLM 不负责确定性计算

以下节点不允许依赖 LLM：

```text
数据获取
数据质量检查
OHLCV 标准化
指标计算
MFE / MAE 计算
基础 setup 条件判断
数据库写入
风控硬规则
```

LLM 可参与：

```text
证据链解释
反方验证
失败原因总结
规律候选摘要
context_pack 压缩
用户可读说明
```

---

### 6.3 所有判断必须结构化

系统不能输出散文式判断：

```text
TSLA 看起来不错，可以关注。
```

必须输出 `DecisionEnvelope`：

```text
symbol
timestamp
timeframe
market_state
setup
status
confidence
supporting_evidence
opposing_evidence
entry_conditions
invalidation_conditions
risk_gate_status
next_check
```

---

## 7. 成功标准

### 7.1 系统级成功标准

系统完成后必须做到：

```text
1. 每次市场监控都能生成结构化判断。
2. 每个判断都能永久落库。
3. 每个判断都能关联当时的数据质量、特征、setup 和风险状态。
4. 每个判断都能在后续被 outcome labeling。
5. 系统能基于历史结果生成 insight_candidate。
6. 用户确认后，insight_candidate 可以进入 pattern_memory。
7. pattern_memory 支持 active / degraded / invalidated / archived 状态。
8. failure_memory 可以保存失败教训。
9. CLI 启动时可以生成 context_pack.md。
10. Agent 启动后能读取 context_pack.md，并恢复历史规律与风险边界。
```

---

### 7.2 MVP 验收标准

MVP 必须跑通以下闭环：

```text
trader memory init
  ↓
trader monitor run --symbols SPY,QQQ,TSLA,NVDA,AAPL --timeframes 5m,1d
  ↓
生成 DecisionEnvelope
  ↓
写入 decision_memories
  ↓
trader memory label-outcomes --window 2h
  ↓
写入 outcome_memories
  ↓
trader memory generate-insights --setup VWAP_RECLAIM --symbol TSLA
  ↓
生成 insight_candidate
  ↓
trader memory promote-pattern --candidate-id insight_001
  ↓
写入 pattern_memories
  ↓
trader memory bootstrap --profile default
  ↓
生成 .runtime/context/context_pack.md
```

---

## 8. 必须用户确认的步骤

系统必须在以下动作前要求用户确认。

### 8.1 交易权限确认

```text
1. 从 monitor_only 切换到 paper trading。
2. 从 paper trading 切换到 live trading。
3. 允许自动化下单。
4. 允许期权交易。
5. 允许杠杆 ETF。
6. 允许隔夜持仓。
```

MVP 默认：

```text
mode = monitor_only
live_trading = disabled
paper_trading = requires_user_confirmation
```

---

### 8.2 风控变更确认

以下规则变更必须确认：

```text
1. 单笔最大风险放宽。
2. 单日最大亏损放宽。
3. 风控 blocked 后允许绕过。
4. 允许在数据质量 warning 状态下继续判断。
5. 允许 degraded pattern 继续作为高优先级信号。
```

---

### 8.3 规律记忆确认

以下动作必须确认：

```text
1. insight_candidate 晋升为 active pattern。
2. pattern 权重大幅上调。
3. active pattern 被永久删除。
4. degraded pattern 被恢复 active。
5. invalidated pattern 被重新启用。
```

系统可以自动执行：

```text
candidate → testing
active → degraded
degraded → invalidated
```

但必须记录原因，并在 context_pack 中提示。

---

### 8.4 数据源策略确认

以下动作必须确认：

```text
1. 改变主数据源优先级。
2. 将 yfinance 提升为实时主报价源。
3. 忽略 source_conflict 继续判断。
4. 接入新的付费数据源。
5. 将数据质量失败的数据写入高置信规律。
```

---

## 9. 失败处理原则

### 9.1 数据源失败

情况：

```text
Longbridge / Alpha Vantage / yfinance 拉取失败。
```

处理：

```text
1. 标记 source_failed。
2. 尝试 fallback source。
3. fallback 成功则继续，但降低 confidence。
4. fallback 失败则返回 data_quality_failed。
5. 不进入 setup detection。
6. 记录 failure_memory。
```

---

### 9.2 数据源冲突

情况：

```text
不同数据源当前价格或 OHLCV 偏差过大。
```

处理：

```text
1. 计算 source deviation。
2. 超过 warning 阈值则记录 risk warning。
3. 超过 block 阈值则停止判断。
4. 不生成交易 alert。
5. 写入 source_conflict failure。
```

建议阈值：

```text
实时价格偏差 > 0.3%：warning
实时价格偏差 > 0.8%：block
```

---

### 9.3 数据质量失败

情况：

```text
缺 bar、timestamp 异常、volume 异常、session 混淆、复权混用。
```

处理：

```text
1. DataQualityGate 输出 failed / blocked。
2. MarketMonitorGraph 停止 setup detection。
3. 不生成 DecisionEnvelope，或只生成 data_quality_report。
4. 写入 failure_memory。
```

---

### 9.4 Setup 快速失效

情况：

```text
刚生成 setup_forming，随后价格触发 invalidation。
```

处理：

```text
1. 标记 invalidated。
2. 写入 outcome_memory。
3. 计算 time_to_invalidation。
4. 生成 failure_memory 候选。
5. 后续评估该 setup 是否 degraded。
```

---

### 9.5 LLM 解释错误

情况：

```text
LLM 总结与结构化 evidence 不一致。
```

处理：

```text
1. 拒绝写入 pattern_memory。
2. 重新生成解释一次。
3. 若仍不一致，降级为纯规则输出。
4. 写入 llm_explanation_error。
```

---

### 9.6 规律失效

情况：

```text
某 active pattern 最近表现明显下降。
```

处理：

```text
1. 标记 degraded。
2. 写入 degraded reason。
3. 在 context_pack 显示 Active Warning。
4. 不自动删除。
5. 等待人工 review。
```

---

## 10. 默认运行模式

MVP 默认配置：

```yaml
mode: monitor_only
live_trading_enabled: false
paper_trading_requires_confirmation: true
watchlist:
  - SPY
  - QQQ
  - TSLA
  - NVDA
  - AAPL
timeframes:
  - 5m
  - 1d
setups:
  - VWAP_RECLAIM
  - RELATIVE_STRENGTH_PULLBACK
  - OPENING_RANGE_BREAKOUT
```

---

## 11. 开发 Agent 执行约束

开发 Agent 必须遵守：

```text
1. 先阅读现有项目结构。
2. 不做无关重构。
3. 优先复用已有 Longbridge / Alpha Vantage / yfinance 接入。
4. 优先复用已有 SQLite / FastAPI / LangGraph 结构。
5. 每个 phase 单独提交。
6. 每个 phase 必须有测试。
7. 不实现 live trading。
8. 不引入未经确认的大型依赖。
9. 不把 LLM 放进确定性计算节点。
10. 所有新增表、Graph Node、CLI 命令必须有最小测试。
```

---

## 12. 本文档完成定义

开发 Agent 阅读本文档后，应明确：

```text
1. 系统做什么。
2. 系统不做什么。
3. MVP 范围是什么。
4. 哪些动作必须用户确认。
5. 数据失败、判断失败、规律失效时怎么处理。
6. 默认安全边界是什么。
7. 后续文档应该如何接续实现架构、数据库、Graph、CLI 和测试。
```
