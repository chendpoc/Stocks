# 05. Market Data Service

> **⚠️**: 行情数据存储复用现有 `market_bars` 表（`schema.py`），
> 扩展 `source` / `quality_status` 列即可，不新建 `market_snapshots` 表。
> 数据源 adapter 已有 Longbridge skill / yfinance / Alpha Vantage 接入。

## 1. 文档目的

本文档定义 `Permanent Memory Market Agent` 的行情数据服务层设计。

本模块负责统一接入当前项目已有的数据源：

```text
Longbridge CLI / SDK
Alpha Vantage
yfinance
```

并向上层 `MarketMonitorGraph` 提供稳定、标准化、可审计的行情数据接口。

本模块的核心目标不是“多接几个 API”，而是建立一个可靠的市场数据入口：

```text
MarketMonitorGraph
  ↓
MarketDataService
  ↓
SourceRouter
  ↓
LongbridgeAdapter / AlphaVantageAdapter / YFinanceAdapter
  ↓
DataNormalizer
  ↓
DataQualityGate
  ↓
MarketDataResponse
```

---

## 2. 模块目标

`MarketDataService` 需要做到：

```text
1. 屏蔽不同数据源的接口差异。
2. 将不同数据源返回值统一为标准 OHLCV / Snapshot。
3. 根据实时 / 历史 / snapshot 需求选择合适数据源。
4. 支持数据源 fallback。
5. 支持 source conflict 检测。
6. 支持数据质量检查。
7. 输出 DataQualityReport。
8. 将可用行情写入 `market_bars`（概念名：market_snapshots）。
9. 不让上层 Graph 直接依赖具体数据源。
```

---

## 3. 非目标

本模块不做：

```text
1. 不做 setup detection。
2. 不做交易判断。
3. 不生成 DecisionEnvelope。
4. 不做 LLM 解释。
5. 不做回测。
6. 不做自动下单。
7. 不在 adapter 内部做复杂策略逻辑。
8. 不让某个数据源的私有字段污染上层 schema。
```

---

## 4. 核心原则

### 4.1 上层只依赖 MarketDataService

禁止：

```text
MarketMonitorGraph → yfinance
MarketMonitorGraph → Alpha Vantage
MarketMonitorGraph → Longbridge
SetupDetector → Longbridge
FeatureEngine → yfinance
```

允许：

```text
MarketMonitorGraph → MarketDataService
FeatureEngine → MarketDataResponse
OutcomeGraph → MarketDataService
```

---

### 4.2 数据源职责分层

| 数据源           | MVP 职责                | 不建议承担       |
| ------------- | --------------------- | ----------- |
| Longbridge    | 实时行情、当前报价、盘中 snapshot | 长历史主库       |
| Alpha Vantage | 日线、分钟线、技术指标补充         | 高频实时主链路     |
| yfinance      | 历史补全、原型验证、非关键分析       | 真实交易前最终报价依据 |

---

### 4.3 数据质量优先于模型判断

如果数据质量失败：

```text
1. 停止 setup detection。
2. 不生成交易倾向。
3. 写入 failure_memory。
4. 返回 data_quality_failed。
```

不能让 LLM 对脏数据继续解释。

---

### 4.4 原始响应可保存，但不能污染统一 schema

Adapter 可以保存：

```text
raw_json
```

但上层只能读取统一结构：

```text
OHLCVBar
MarketSnapshot
MarketDataResponse
DataQualityReport
```

---

## 5. 推荐目录结构

```text
apps/trader-agent/backend/app/intel/market_data/
  market_data_service.py
  source_router.py
  adapters.py
  longbridge_adapter.py
  alphavantage_adapter.py
  yfinance_adapter.py
  normalizer.py
  quality_gate.py
  schemas.py
  errors.py
```

---

## 6. 核心数据结构

## 6.1 `OHLCVBar`

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Any

@dataclass
class OHLCVBar:
    symbol: str
    timestamp: datetime
    timeframe: str
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    source: str
    session: str | None = None
    raw: dict[str, Any] | None = None
```

字段要求：

| 字段                    | 要求                                         |
| --------------------- | ------------------------------------------ |
| `symbol`              | 必须标准化为大写，例如 TSLA                           |
| `timestamp`           | 必须带时区或统一转换为项目标准时间                          |
| `timeframe`           | 例如 1m / 5m / 1d                            |
| `open/high/low/close` | 不允许 high < low 等异常                         |
| `volume`              | 允许为 0，但需要 DataQualityGate 标记               |
| `source`              | longbridge / alphavantage / yfinance       |
| `session`             | premarket / regular / afterhours / unknown |
| `raw`                 | 原始响应，供排查使用                                 |

---

## 6.2 `MarketDataRequest`

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

@dataclass
class MarketDataRequest:
    symbol: str
    timeframe: str
    mode: Literal["realtime", "historical", "snapshot"]
    start: datetime | None = None
    end: datetime | None = None
    preferred_source: str | None = None
    allow_fallback: bool = True
    require_regular_session: bool = False
```

字段说明：

| 字段                        | 说明                               |
| ------------------------- | -------------------------------- |
| `symbol`                  | 标的，例如 TSLA                       |
| `timeframe`               | 1m / 5m / 1d                     |
| `mode`                    | realtime / historical / snapshot |
| `start`                   | 历史数据开始时间                         |
| `end`                     | 历史数据结束时间                         |
| `preferred_source`        | 指定优先数据源                          |
| `allow_fallback`          | 主源失败是否允许 fallback                |
| `require_regular_session` | 是否只允许 regular session            |

---

## 6.3 `DataQualityReport`

```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass
class DataQualityReport:
    quality_status: Literal["pass", "warning", "failed", "blocked"]
    source: str
    latency_seconds: float | None = None
    missing_bars: int = 0
    duplicate_bars: int = 0
    out_of_order_bars: int = 0
    abnormal_ohlc_count: int = 0
    zero_volume_count: int = 0
    source_conflict: bool = False
    price_deviation: float | None = None
    session: str | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
```

---

## 6.4 `MarketDataResponse`

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class MarketDataResponse:
    symbol: str
    timeframe: str
    mode: str
    source: str
    bars: list[OHLCVBar]
    quality: DataQualityReport
    fetched_at: datetime
    fallback_used: bool = False
    fallback_sources_tried: list[str] | None = None
```

---

## 7. SourceRouter 设计

### 7.1 模块职责

`SourceRouter` 根据请求类型选择数据源。

输入：

```text
MarketDataRequest
```

输出：

```text
source priority list
```

---

### 7.2 默认优先级

#### realtime

```text
Longbridge
Alpha Vantage
yfinance
```

#### snapshot

```text
Longbridge
Alpha Vantage
yfinance
```

#### historical 5m

```text
Longbridge
Alpha Vantage
yfinance
```

#### historical 1d

```text
Alpha Vantage
yfinance
Longbridge
```

---

### 7.3 示例接口

```python
class SourceRouter:
    def get_sources(self, request: MarketDataRequest) -> list[str]:
        ...
```

---

### 7.4 路由规则

```python
def get_sources(self, request: MarketDataRequest) -> list[str]:
    if request.preferred_source:
        return [request.preferred_source] + fallback_sources(request.preferred_source)

    if request.mode in ["realtime", "snapshot"]:
        return ["longbridge", "alphavantage", "yfinance"]

    if request.mode == "historical" and request.timeframe == "1d":
        return ["alphavantage", "yfinance", "longbridge"]

    if request.mode == "historical":
        return ["longbridge", "alphavantage", "yfinance"]

    return ["longbridge", "alphavantage", "yfinance"]
```

---

## 8. Adapter 设计

## 8.1 Adapter Interface

所有数据源 adapter 必须实现统一接口。

```python
from typing import Protocol

class MarketDataAdapter(Protocol):
    source_name: str

    def fetch(self, request: MarketDataRequest) -> list[OHLCVBar]:
        ...
```

---

## 8.2 `LongbridgeAdapter`

### 职责

```text
1. 调用现有 Longbridge CLI / SDK。
2. 获取实时行情、snapshot、分钟线。
3. 返回标准 OHLCVBar。
4. 保存 raw response。
```

### 不做

```text
1. 不做 setup 判断。
2. 不做策略解释。
3. 不直接写 DecisionEnvelope。
```

### 注意事项

Longbridge 优先用于实时链路。
如果 Longbridge 请求失败，必须抛出标准化异常：

```python
class MarketDataSourceError(Exception):
    source: str
    message: str
```

---

## 8.3 `AlphaVantageAdapter`

### 职责

```text
1. 调用已有 Alpha Vantage 接入。
2. 获取日线、分钟线、技术指标补充数据。
3. 返回标准 OHLCVBar。
4. 处理 API 限流、空响应、字段缺失。
```

### 注意事项

Alpha Vantage 可能存在：

```text
1. API rate limit
2. response note
3. compact / full outputsize 差异
4. adjusted / non-adjusted 数据差异
```

Adapter 必须把这些异常转为标准化错误或 warning。

---

## 8.4 `YFinanceAdapter`

### 职责

```text
1. 调用已有 yfinance 接入。
2. 获取历史数据补全。
3. 用于原型验证和非关键分析。
```

### 注意事项

yfinance 不应作为真实交易前最终报价依据。
如果 yfinance 被用于 realtime fallback，必须在 `DataQualityReport.warnings` 中标记：

```text
yfinance_used_as_realtime_fallback
```

---

## 9. DataNormalizer 设计

### 9.1 模块职责

将不同数据源返回值标准化为统一 `OHLCVBar`。

---

### 9.2 标准化内容

```text
1. symbol 大写
2. timestamp 转为项目统一时间格式
3. timeframe 统一命名
4. open/high/low/close 转为 float
5. volume 转为 float
6. session 标记
7. source 标记
8. raw response 保留
```

---

### 9.3 时间处理

所有时间必须统一为项目标准。

建议：

```text
1. 数据库保存 ISO 8601 字符串。
2. 内部对象使用 datetime。
3. 不允许 naive datetime 在系统内部传播。
```

如果无法确定时区：

```text
1. 标记 timezone_unknown。
2. DataQualityReport 添加 warning。
3. 不允许进入高置信 setup 判断。
```

---

### 9.4 OHLC 合法性

基础规则：

```text
high >= low
high >= open
high >= close
low <= open
low <= close
close > 0
```

违反时：

```text
1. abnormal_ohlc_count += 1
2. quality_status 至少为 warning
3. 严重时 blocked
```

---

## 10. DataQualityGate 设计

### 10.1 模块职责

检查 `MarketDataResponse` 是否可用于后续分析。

---

### 10.2 检查项

```text
1. empty bars
2. missing bars
3. duplicate timestamp
4. out-of-order timestamp
5. abnormal OHLC
6. zero volume
7. stale data
8. timezone mismatch
9. session mismatch
10. source conflict
```

---

### 10.3 质量状态

```text
pass
warning
failed
blocked
```

状态含义：

| 状态        | 含义          | 是否允许继续           |
| --------- | ----------- | ---------------- |
| `pass`    | 数据正常        | 是                |
| `warning` | 有轻微问题       | 是，但降低 confidence |
| `failed`  | 数据不足以判断     | 否                |
| `blocked` | 数据存在严重冲突或异常 | 否                |

---

### 10.4 规则示例

#### empty bars

```text
bars = []
=> quality_status = failed
```

#### duplicate timestamp

```text
duplicate_bars > 0
=> quality_status >= warning
```

#### abnormal OHLC

```text
abnormal_ohlc_count > 0
=> quality_status >= warning

abnormal_ohlc_count / total_bars > 5%
=> quality_status = blocked
```

#### stale realtime data

```text
mode = realtime
latency_seconds > threshold
=> warning / failed
```

建议阈值：

```text
regular session 实时数据延迟 > 30s：warning
regular session 实时数据延迟 > 120s：failed
```

#### source conflict

```text
实时价格偏差 > 0.3%：warning
实时价格偏差 > 0.8%：blocked
```

---

## 11. Source Conflict 检测

### 11.1 模块职责

当多个数据源可用时，检查价格差异。

---

### 11.2 输入

```text
primary_response
secondary_response
```

---

### 11.3 计算方式

```python
price_deviation = abs(primary_close - secondary_close) / primary_close
```

---

### 11.4 阈值

```text
price_deviation > 0.003：warning
price_deviation > 0.008：blocked
```

---

### 11.5 处理规则

如果 warning：

```text
1. 允许继续。
2. 降低 confidence。
3. 在 DataQualityReport.warnings 中记录。
```

如果 blocked：

```text
1. 停止 setup detection。
2. 写入 failure_memory。
3. 不生成交易 alert。
```

---

## 12. MarketDataService 主流程

### 12.1 输入

```text
MarketDataRequest
```

---

### 12.2 流程

```text
1. SourceRouter 根据 request 生成 sources。
2. 按优先级调用 adapter。
3. Adapter 返回原始 OHLCVBar。
4. DataNormalizer 标准化数据。
5. DataQualityGate 检查数据质量。
6. 如果通过，返回 MarketDataResponse。
7. 如果失败且 allow_fallback = true，尝试下一数据源。
8. 如果全部失败，返回 failed response 或抛出标准错误。
9. 将 `market_bars` 写入（概念名：market_snapshots）数据库。
```

---

### 12.3 伪代码

```python
class MarketDataService:
    def __init__(
        self,
        router: SourceRouter,
        adapters: dict[str, MarketDataAdapter],
        normalizer: DataNormalizer,
        quality_gate: DataQualityGate,
        snapshot_repository: MarketSnapshotRepository,
    ):
        self.router = router
        self.adapters = adapters
        self.normalizer = normalizer
        self.quality_gate = quality_gate
        self.snapshot_repository = snapshot_repository

    def fetch(self, request: MarketDataRequest) -> MarketDataResponse:
        sources = self.router.get_sources(request)
        errors = []
        fallback_sources_tried = []

        for index, source in enumerate(sources):
            adapter = self.adapters[source]
            fallback_sources_tried.append(source)

            try:
                raw_bars = adapter.fetch(request)
                bars = self.normalizer.normalize(raw_bars, request=request, source=source)
                quality = self.quality_gate.validate(bars, request=request, source=source)

                response = MarketDataResponse(
                    symbol=request.symbol.upper(),
                    timeframe=request.timeframe,
                    mode=request.mode,
                    source=source,
                    bars=bars,
                    quality=quality,
                    fetched_at=now(),
                    fallback_used=index > 0,
                    fallback_sources_tried=fallback_sources_tried,
                )

                self.snapshot_repository.bulk_create_from_response(response)

                if quality.quality_status in ["pass", "warning"]:
                    return response

                if not request.allow_fallback:
                    return response

            except MarketDataSourceError as error:
                errors.append(error)
                if not request.allow_fallback:
                    raise

        return MarketDataResponse(
            symbol=request.symbol.upper(),
            timeframe=request.timeframe,
            mode=request.mode,
            source="none",
            bars=[],
            quality=DataQualityReport(
                quality_status="failed",
                source="none",
                errors=[str(error) for error in errors],
            ),
            fetched_at=now(),
            fallback_used=True,
            fallback_sources_tried=fallback_sources_tried,
        )
```

---

## 13. 数据写入规则

### 13.1 `market_bars` 写入（概念名：market_snapshots）

每次成功从数据源拿到可解析 bars，均应写入：

```text
market_bars（概念名：market_snapshots）
```

包括：

```text
quality_status = pass
quality_status = warning
quality_status = failed
quality_status = blocked
```

原因：

```text
失败数据也有排查价值。
```

---

### 13.2 不写入 feature_snapshots

`MarketDataService` 不负责写入 `feature_snapshots`。
该动作由 `FeatureEngine` 负责。

---

### 13.3 不写入 `model_decisions`（概念名：decision_memories）

`MarketDataService` 不负责写入 `model_decisions`（概念名：decision_memories）。
该动作由 `MemoryGraph` 或 `MarketMonitorGraph` 后续节点负责。

---

## 14. 错误类型

### 14.1 标准错误

```python
class MarketDataError(Exception):
    pass

class MarketDataSourceError(MarketDataError):
    def __init__(self, source: str, message: str):
        self.source = source
        self.message = message
        super().__init__(f"{source}: {message}")

class MarketDataNormalizationError(MarketDataError):
    pass

class MarketDataQualityError(MarketDataError):
    pass
```

---

### 14.2 错误处理原则

```text
1. adapter 内部错误必须转为 MarketDataSourceError。
2. normalizer 错误必须转为 MarketDataNormalizationError。
3. quality failed 不一定抛异常，可通过 DataQualityReport 返回。
4. blocked 状态必须阻止后续 setup detection。
```

---

## 15. FastAPI 接口建议

### 15.1 获取行情

```http
POST /api/market-data/fetch
```

请求：

```json
{
  "symbol": "TSLA",
  "timeframe": "5m",
  "mode": "historical",
  "start": "2026-06-10T09:30:00-04:00",
  "end": "2026-06-10T16:00:00-04:00",
  "preferred_source": "longbridge",
  "allow_fallback": true
}
```

响应：

```json
{
  "symbol": "TSLA",
  "timeframe": "5m",
  "mode": "historical",
  "source": "longbridge",
  "bars_count": 78,
  "quality": {
    "quality_status": "pass",
    "missing_bars": 0,
    "warnings": [],
    "errors": []
  },
  "fallback_used": false
}
```

---

### 15.2 数据源健康检查

```http
GET /api/market-data/health
```

响应：

```json
{
  "sources": {
    "longbridge": {
      "status": "ok",
      "last_success_at": "2026-06-10T09:45:00-04:00"
    },
    "alphavantage": {
      "status": "rate_limited",
      "last_error": "API limit reached"
    },
    "yfinance": {
      "status": "ok"
    }
  }
}
```

---

## 16. CLI 命令建议

### 16.1 获取单个标的行情

```bash
npm run workflows -- market-data fetch --symbol TSLA --timeframe 5m --mode historical
```

---

### 16.2 指定数据源

```bash
npm run workflows -- market-data fetch --symbol TSLA --timeframe 1d --mode historical --source alphavantage
```

---

### 16.3 数据源健康检查

```bash
npm run workflows -- market-data health
```

---

### 16.4 检查数据质量

```bash
npm run workflows -- market-data quality --symbol TSLA --timeframe 5m
```

---

## 17. 测试计划

### 17.1 单元测试

必须覆盖：

```text
test_source_router_realtime_priority
test_source_router_historical_daily_priority
test_normalizer_symbol_uppercase
test_normalizer_ohlcv_fields
test_quality_gate_empty_bars_failed
test_quality_gate_duplicate_timestamp_warning
test_quality_gate_abnormal_ohlc_blocked
test_quality_gate_stale_realtime_failed
test_market_data_service_fallback
test_market_data_service_no_fallback
```

---

### 17.2 Adapter 测试

对每个 adapter 至少测试：

```text
1. 正常响应可以转换为 OHLCVBar。
2. 空响应转为 failed / error。
3. 字段缺失可以产生 warning 或 error。
4. API 限流可以被捕获。
5. raw response 可以保存。
```

---

### 17.3 集成测试

必须覆盖：

```text
MarketDataService
  ↓
SourceRouter
  ↓
Adapter
  ↓
Normalizer
  ↓
DataQualityGate
  ↓
MarketDataResponse
  ↓
market_bars（概念名：market_snapshots）
```

---

## 18. Task 002：MarketDataService + DataQualityGate

### 18.1 目标

实现统一行情数据入口，复用已有 Longbridge / Alpha Vantage / yfinance 接入，并提供标准化 `MarketDataResponse`。

---

### 18.2 范围

必须实现：

```text
1. MarketDataRequest
2. OHLCVBar
3. MarketDataResponse
4. DataQualityReport
5. SourceRouter
6. Adapter interface
7. LongbridgeAdapter
8. AlphaVantageAdapter
9. YFinanceAdapter
10. DataNormalizer
11. DataQualityGate
12. MarketDataService
13. `market_bars` 写入（概念名：market_snapshots）
```

---

### 18.3 不做

本任务不做：

```text
1. 不做 FeatureEngine。
2. 不做 SetupDetector。
3. 不做 DecisionEnvelope。
4. 不做 OutcomeGraph。
5. 不做 PatternMemory。
6. 不做 live trading。
```

---

### 18.4 验收标准

Task 002 完成后必须满足：

```text
1. 可以对 SPY / QQQ / TSLA / NVDA / AAPL 拉取 5m / 1d 数据。
2. 可以按 request mode 路由到合适数据源。
3. 主数据源失败时可以 fallback。
4. 不同数据源返回值可以标准化为 OHLCVBar。
5. DataQualityGate 可以输出 pass / warning / failed / blocked。
6. 行情快照可以写入现有 `market_bars`。
7. 数据质量 failed / blocked 时，不允许进入后续 setup detection。
8. 所有核心逻辑有单元测试。
```

---

## 19. 下一步

阅读并实现：

```text
06_market_monitor_graph.md
```

重点完成：

```text
1. MarketMonitorGraph 节点设计
2. FeatureEngine 串联
3. SetupDetector 串联
4. EvidenceGraphBuilder 串联
5. RiskGate 串联
6. DecisionEnvelope 生成
7. model_decisions 写入（概念名：decision_memories）
```
