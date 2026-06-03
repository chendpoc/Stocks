# Forward Market Intelligence Agent 系统设计文档

## 1. 背景

本系统的目标不是构建一个传统意义上的“自动喊单机器人”，也不是单纯做价格预测的量化模型。

用户真正需要的是一个能够结合以下信息进行市场研究、前瞻解读、信号验证和交易计划推演的系统：

1. 市场历史数据与历史规律；
2. 新闻、政策、地缘事件与市场反应；
3. Smart Money / 对手盘行为，例如机构、大户、ARK、Baron、内部人、期权大单、ETF 流；
4. 日内盘面结构，例如先空后多、多空双杀、锯齿震荡、单边趋势；
5. 技术结构，例如回踩、更高低点、缩量下跌、放量反弹、吸筹、派发；
6. LLM 对市场现象的专业解释、通俗解释、反方审计和前瞻假说；
7. 每次判断后的 1D / 3D / 5D / 10D 后验复盘；
8. 通过复盘不断沉淀经验，使系统解释方向逐渐成熟。

系统的终态不是让 LLM 直接说“买什么”，而是帮助用户从：

```text
感觉 → 冲动 → 事后找理由
```

升级为：

```text
假说 → 证据 → 验证点 → 条件触发 → 风控计划 → 复盘学习
```

---

## 2. 系统定位

系统名称建议：

```text
Forward Market Intelligence Agent
前瞻性市场情报 Agent
```

更完整的定义：

> 本系统是一个结合市场数据、新闻事件、政策语言、Smart Money 行为、期权结构、历史案例、技术结构和 LLM 推理能力的前瞻性市场情报系统。系统不以直接预测涨跌为目标，而是主动发现市场异常、生成可验证的前瞻假说、解释市场结构、推测交易机会，并通过持续复盘更新经验库。

系统不是：

- 不是全自动交易机器人；
- 不是单纯技术指标系统；
- 不是简单新闻摘要工具；
- 不是纯量化因子回测平台；
- 不是 LLM 自由讲故事的市场评论器；
- 不是保证胜率的交易系统。

系统是：

- 市场研究助手；
- 盘前剧本生成器；
- 盘中结构侦察员；
- 对手盘意图研究员；
- 交易机会审计员；
- 收盘复盘教练；
- 经验持续沉淀系统。

---

## 3. 核心目标

系统需要解决的问题：

### 3.1 今天市场在交易什么？

例如：

- Trump 关税威胁；
- TACO 模式；
- Fed 利率预期；
- 美伊地缘风险；
- AI / 半导体主线；
- 高 beta 去杠杆；
- 期权负 gamma 放大；
- 财报季风险；
- 季节性流动性回撤。

### 3.2 今天盘面可能怎么走？

系统需要识别：

- 先空后多；
- 先多后空；
- 多空双杀；
- 锯齿震荡；
- 单边趋势；
- 假突破；
- 假跌破；
- 尾盘挤压；
- 期权墙压制。

### 3.3 对手盘 / Smart Money 在干什么？

系统需要解释：

- ARK 买入 TSLA 是否有效；
- Baron 这类长期资金是否只是信心锚，而非日内主导方；
- 大户买盘是否被吸收；
- 卖压是否被接住；
- 期权流是真方向下注，还是对冲 / 价差的一条腿；
- ETF / 指数资金是否在主导；
- 内部人交易是否有意义；
- 13F 是否只能用于长期趋势，不能用于日内解释。

### 3.4 当前是否存在交易机会？

系统需要给出：

- 交易机会是否成立；
- 当前只是观察，还是 setup forming；
- 是否可以试探仓；
- 什么条件才能确认；
- 什么情况必须放弃；
- 应该使用正股、ETF、杠杆 ETF、期权、价差，还是不交易；
- 是否和现有仓位重复暴露；
- 最大亏损和失效位是什么。

### 3.5 系统如何变得有经验？

系统需要持续记录：

- 当时的市场假说；
- 支持证据；
- 反方证据；
- 置信度；
- 验证窗口；
- 后续结果；
- 复盘结论；
- 经验更新；
- 下一次如何调整解释方向。

---

## 4. 与成熟量化系统的关系

传统量化系统通常是：

```text
数据接入
→ 因子构建
→ 回测
→ 信号生成
→ 组合构建
→ 风控
→ 执行
→ 归因
```

本系统在此基础上加入 LLM 叙事推理：

```text
数据接入
→ 特征 / 事件 / 规律抽取
→ 市场状态与结构识别
→ LLM 多假说解释
→ 证据审计
→ 前瞻假说
→ 交易机会评分
→ 风控计划
→ 复盘学习
→ 经验库更新
```

核心差异：

| 维度 | 传统量化系统 | 本系统 |
|---|---|---|
| 核心对象 | 因子 / 价格序列 | 市场叙事 / 事件 / 对手盘 / 结构 |
| 数据类型 | 数值为主 | 数值 + 新闻 + 政策 + 语言 + 行为 |
| 输出 | 买卖信号 | 条件化市场假说与交易计划 |
| LLM 角色 | 通常没有 | 假说生成、解释、审计、复盘 |
| 学习方式 | 回测优化 | 假说复盘 + 经验库 + 权重更新 |
| 用户交互 | 较少 | 高交互市场研究工作台 |
| 风险 | 因子过拟合 | 叙事过拟合 / LLM 编故事 |

---

## 5. 总体架构

系统稳定为 10 个一级模块。

```text
1. Data & Ingestion Layer
2. Market Knowledge Layer
3. Feature / Event / Pattern Layer
4. Regime & Structure Analysis Layer
5. LLM Reasoning & Hypothesis Layer
6. Signal & Opportunity Layer
7. Strategy / Portfolio / Risk Layer
8. Execution & Alert Layer
9. Postmortem & Learning Layer
10. Web Research Workbench
```

---

# 6. 一级模块设计

## 6.1 Data & Ingestion Layer：数据接入层

### 目标

负责接入所有原始数据，不做复杂判断。

### 数据类型

| 数据类型 | 示例 |
|---|---|
| 行情数据 | OHLCV、分钟线、日线、盘前盘后、VWAP |
| 指数 / ETF | SPY、QQQ、IWM、ARKK、XLK、XLY、XLE |
| 期权数据 | volume、OI、IV、put/call、skew、GEX |
| 机构持仓 | 13F、13D、13G、Form 4、N-PORT |
| Smart Money | ARK daily trades、Baron 持仓、内部人交易、期权大单 |
| 新闻事件 | Reuters、Bloomberg、WSJ、白宫、Fed、USTR、公司公告 |
| 宏观数据 | CPI、PCE、NFP、FOMC、10Y、美元、油价、VIX |
| 用户输入 | whop 群观点、交易员观点、个人观察 |

### 数据源优先级

MVP 阶段建议：

- 行情：Alpaca / FMP / Alpha Vantage / Polygon 任选其一；
- 新闻：官方源 + Alpha Vantage News / FMP News / RSS；
- SEC：SEC EDGAR 官方 API；
- ARK：官网公开持仓 / 交易数据；
- 宏观：FRED；
- 用户观点：手动录入；
- 期权：第一版只做基础 options summary，不做高价实时 flow。

---

## 6.2 Market Knowledge Layer：市场知识层

### 目标

建立系统的基础市场常识和机制知识。

### 内容

| 类型 | 示例 |
|---|---|
| 资产关系 | TSLL 是 TSLA 杠杆 ETF；QQQ 是高 beta 科技股重要 benchmark |
| 机构画像 | ARK 偏成长股高 beta；Baron 是 TSLA 长期信心锚 |
| 市场机制 | dealer gamma、ETF 再平衡、VWAP 执行、止损扫盘 |
| 技术结构 | 更高低点、缩量回踩、放量突破、假跌破 |
| 事件模式 | TACO、地缘升级-缓和、财报利好不涨 |
| 风险知识 | 杠杆 ETF 有波动损耗；期权有 IV / theta 风险 |

### 示例知识

```yaml
concept: higher_low_with_volume_contraction
meaning: 更高低点 + 下跌缩量，表示卖压可能衰竭
confirmation: 需要反弹放量或站回关键位
risk: 缩量下跌也可能只是无人买入，不能单独视为底部确认
```

---

## 6.3 Feature / Event / Pattern Layer：特征、事件与规律层

### 目标

把原始数据加工成结构化特征、事件和模式。

### 市场特征

| 特征 | 说明 |
|---|---|
| relative_strength_vs_QQQ | 相对 QQQ 强弱 |
| relative_strength_vs_SPY | 相对 SPY 强弱 |
| volume_vs_20d_avg | 成交量相对 20 日均量 |
| distance_to_vwap | 价格距离 VWAP |
| higher_low_detected | 是否形成更高低点 |
| pullback_quality_score | 回踩质量 |
| trend_strength | 趋势强度 |
| support_hold_quality | 支撑守住质量 |

### 期权特征

| 特征 | 说明 |
|---|---|
| put_call_volume_ratio | put/call 成交比 |
| iv_rank | IV 分位 |
| skew_change | skew 变化 |
| large_oi_strikes | 大 OI 行权价 |
| call_flow_no_price_reaction | call 多但正股不涨 |
| put_flow_no_price_reaction | put 多但正股不跌 |

### 事件特征

| 事件类型 | 示例 |
|---|---|
| policy_threat | Trump 关税威胁 |
| policy_walkback | 政策软化 / 延期 / 豁免 |
| geopolitical_escalation | 地缘升级 |
| geopolitical_deescalation | 地缘缓和 |
| fed_hawkish_shift | Fed 转鹰 |
| fed_dovish_shift | Fed 转鸽 |
| earnings_surprise | 财报超预期 |
| new_term_detected | 新词出现 |

### 模式特征

| Pattern | 示例 |
|---|---|
| TACO | Trump 强硬威胁 → 市场跌 → 软化 → 反弹 |
| weekly geopolitical rhythm | 周初升级 → 避险 → 后半周缓和 |
| semiannual pullback | 每年 1–2 次大回调 |
| higher-low accumulation | 更高低点 + 缩量回踩 |
| failed breakout | 突破失败后回落 |
| buying absorbed | 买盘被吸收 |
| selling absorbed | 卖压被接住 |

---

## 6.4 Regime & Structure Analysis Layer：市场状态与结构分析层

### 目标

判断当前市场、日内盘面、技术结构和资金流结构。

### 6.4.1 Market Regime Detector

识别：

- risk-on；
- risk-off；
- macro beta selloff；
- policy threat mode；
- TACO candidate；
- geopolitical risk mode；
- earnings-driven mode；
- liquidity pullback；
- gamma-pinned mode；
- negative-gamma trend；
- chop mode；
- accumulation mode；
- distribution mode。

输出示例：

```markdown
## Market Regime Card

当前状态：policy-threat + high-beta weakness  
主导变量：Trump 关税讲话、QQQ 回调、VIX 上升  
交易含义：个股弱势优先解释为宏观 / 政策 beta，不要过度归因到单一机构。
```

### 6.4.2 Intraday Structure Classifier

识别：

- 先空后多；
- 先多后空；
- 多空双杀；
- 锯齿震荡；
- 单边趋势；
- 假突破；
- 假跌破；
- 尾盘挤压。

输出示例：

```markdown
当前盘面：先空后多候选

验证点：
- QQQ 是否站回 VWAP；
- VIX 是否回落；
- TSLA / NVDA 是否收回跌幅；
- 早盘低点是否不再被跌破。
```

### 6.4.3 Technical Structure Analyzer

识别：

- 回踩支撑；
- 更高低点；
- 更低高点；
- 缩量回踩；
- 放量突破；
- 假跌破；
- 假突破；
- 吸筹结构；
- 派发结构。

输出示例：

```markdown
TSLL 正在形成“回踩 + 更高低点候选”结构。  
如果本次回踩低点高于前低，且下跌成交量低于前次，则说明卖压可能衰竭。
```

### 6.4.4 Flow Structure Analyzer

识别：

- 买盘被吸收；
- 卖压被接住；
- 机构承接；
- 机构派发；
- stop-run；
- short covering；
- ETF 再平衡；
- dealer hedging flow。

---

## 6.5 LLM Reasoning & Hypothesis Layer：LLM 推理与假说层

### 目标

LLM 负责假说生成、叙事解释、通俗翻译、反方审计和前瞻推演。

LLM 不直接负责判真，判真需要数据、规则、历史结果和复盘系统共同完成。

### 6.5.1 Hypothesis Generator

输入：

- 市场状态；
- 技术结构；
- 事件；
- Smart Money 行为；
- 期权结构；
- 历史类似案例。

输出：

- 3–5 个候选解释；
- 支持证据；
- 反方证据；
- 缺失证据；
- 验证点；
- 失效条件；
- 置信度。

### 6.5.2 Narrative Interpreter

生成专业解释。

示例：

```text
TSLL 回踩低点高于前低，且下跌量缩，说明卖压边际递减；若反弹放量并站回关键位，则可视为底部结构初步确认。
```

### 6.5.3 Plain-language Translator

生成通俗市场话。

示例：

```text
这次砸盘没有砸出新低，说明下面接货的人开始提前出手。  
如果再往下砸时量越来越小，就像空头子弹越打越少。  
但真正能不能吸筹，还要看反弹时有没有买盘愿意往上推。
```

### 6.5.4 Skeptical Auditor

专门挑错。

它必须检查：

- 是否过度人格化；
- 是否把 13F 用于日内解释；
- 是否缺少 benchmark；
- 是否没有反方解释；
- 是否把通俗故事写成事实；
- 是否没有失效条件；
- 是否忽略杠杆 ETF / 期权风险。

### 6.5.5 Forward Hypothesis Engine

生成前瞻性假说。

示例：

```markdown
如果 TSLL 正在筑底，下一次回踩不应跌破前低，且下跌成交量应继续缩小。  
若随后放量站回 12.2，则吸筹结构确认度上升。

失效条件：
若 TSLL 放量跌破前低，则更高低点结构失败。
```

---

## 6.6 Signal & Opportunity Layer：信号与机会层

### 目标

把分析结果转化为交易候选，而不是直接下单。

### 信号类型

| 类型 | 示例 |
|---|---|
| regime signal | 当前 risk-off，不适合追多 |
| technical signal | 更高低点 + 缩量回踩 |
| flow signal | 卖压被吸收 |
| options signal | put flow 降温 |
| event signal | TACO 软化迹象 |
| smart money signal | ARK 买入但价格未确认 |
| relative strength signal | TSLA 开始跑赢 QQQ |

### 机会状态

| 状态 | 含义 |
|---|---|
| No Trade | 不交易 |
| Watchlist | 观察 |
| Setup Forming | 机会正在形成 |
| Trade Candidate | 可以制定交易计划 |
| High Conviction Candidate | 多信号共振，但仍需风控 |

### 机会评分维度

| 维度 | 说明 |
|---|---|
| setup_quality | 技术结构质量 |
| regime_alignment | 是否顺应市场状态 |
| flow_confirmation | 是否有资金流确认 |
| options_confirmation | 期权结构是否支持 |
| smart_money_confirmation | Smart Money 是否支持 |
| historical_expectancy | 历史类似案例表现 |
| risk_reward | 盈亏比 |
| invalidation_clarity | 失效条件是否明确 |
| crowding_risk | 是否拥挤 |
| time_decay_risk | 期权 / 杠杆 ETF 损耗风险 |

---

## 6.7 Strategy / Portfolio / Risk Layer：策略、组合与风控层

### 目标

防止 LLM 生成看似合理但不可控的交易建议。

### 策略库

| 策略 | 使用条件 |
|---|---|
| Dip-buying | 回踩不破 + 卖压衰竭 |
| Breakout continuation | 放量突破 + 趋势确认 |
| Failed breakout short | 突破失败 + 放量回落 |
| Reversal after stop-run | 假跌破 + 快速收回 |
| TACO rebound | 政策威胁软化 + risk-on 修复 |
| Gamma trend trade | 负 gamma 趋势加速 |
| Range mean-reversion | 正 gamma / chop day |
| Event fade | 利好不涨 / 利空不跌 |

### 风控规则

- 没有失效条件，不交易；
- 没有确认，不重仓；
- 杠杆 ETF 必须有持有时间限制；
- 事件前仓位必须有限制；
- 相关性暴露需要合并计算；
- 单个 idea 必须有最大亏损；
- 连续错误后信号降权；
- LLM 输出必须通过反方审计。

### 组合上下文

系统必须知道：

```text
用户已经持有 TSLL，再买 TSLA call，本质上是增加同一风险因子暴露。
```

系统需要提醒：

```text
这不是新机会，而是增加同方向杠杆暴露。
```

---

## 6.8 Execution & Alert Layer：执行与提醒层

### MVP 阶段目标

第一版不自动下单，只做提醒和交易计划。

### 告警类型

- TSLL 回踩到观察区；
- TSLL 不破前低；
- 下跌成交量低于前次；
- TSLA 站回 VWAP；
- QQQ 转强；
- VIX 回落；
- put flow 降温；
- 交易机会失效；
- 剧本切换。

### 提醒示例

```text
TSLL 正在回踩 11.4–11.6 区间，目前低点仍高于前低，成交量低于上次下跌。  
吸筹结构进入观察阶段，但还缺 TSLA 正股站回 VWAP 的确认。
```

---

## 6.9 Postmortem & Learning Layer：复盘与学习层

### 目标

让系统逐步积累经验，而不是每天重新讲故事。

### 假说跟踪

每个假说必须记录：

- 假说内容；
- 证据；
- 置信度；
- 验证窗口；
- 失效条件；
- 后续结果；
- 是否成立。

### 结果跟踪

自动记录：

- 1D 结果；
- 3D 结果；
- 5D 结果；
- 10D 结果；
- 最大浮盈；
- 最大浮亏；
- 是否触发失效条件；
- 是否跑赢 benchmark。

### 复盘输出

示例：

```markdown
## 复盘

当时判断：
TSLL 正在形成更高低点吸筹结构。

结果：
3D 后 TSLL 上涨，但未突破关键位。

结论：
吸筹判断部分成立，但加仓条件未触发。

经验更新：
更高低点 + 缩量回踩只能作为试探信号，不能作为确认信号。  
以后必须要求 TSLA 正股站回 VWAP 后才提升仓位。
```

---

## 6.10 Web Research Workbench：交互工作台层

### 页面

| 页面 | 功能 |
|---|---|
| Market Overview | 当前市场状态、主导叙事 |
| Signal Feed | 系统发现的异常信号 |
| Narrative Cards | LLM 解释卡 |
| Opportunity Board | 交易候选看板 |
| Trade Plan | 条件化交易计划 |
| Pattern Library | TACO、美伊节奏、回调规律等 |
| Smart Money Tracker | ARK、Baron、内部人、期权流 |
| Postmortem Journal | 每日复盘与经验库 |
| Rule Editor | 用户规则与提醒条件 |

---

# 7. LLM 输出合同

所有 LLM 市场解释必须包含以下字段：

```markdown
# Market Explanation Contract

## 1. Raw Signal
原始信号是什么，不加入推断。

## 2. Verified Facts
已确认事实，每条标注来源或字段。

## 3. Candidate Explanations
列出 3–5 个候选解释。

## 4. Mechanism
每个解释对应市场机制，例如：
- macro beta
- dealer hedging
- institutional flow
- ETF rebalance
- event catalyst
- liquidity absorption
- distribution

## 5. Evidence For
支持证据。

## 6. Evidence Against
反方证据。

## 7. Missing Evidence
缺失证据。

## 8. Falsification Test
什么情况出现后，该解释失效。

## 9. Confidence
低 / 中低 / 中 / 中高 / 高。

## 10. Plain-language Explanation
通俗解释，但不得超过证据等级。

## 11. Tradability
No Trade / Watchlist / Setup Forming / Trade Candidate。
```

---

# 8. 禁止规则

LLM 不允许：

1. 把未验证的对手盘关系写成事实；
2. 说“绝对确定”“必涨”“必跌”；
3. 把 13F 用于日内交易解释；
4. 看到 call flow 就直接看多；
5. 看到 ARK 买入就直接看多；
6. 无反方解释；
7. 无失效条件；
8. 把通俗说法当成事实；
9. 忽略 benchmark；
10. 忽略杠杆 ETF 与期权风险。

---

# 9. MVP 存储方案

MVP 阶段建议使用：

```text
SQLite + Parquet + DuckDB
```

### SQLite 存储

- symbols；
- events；
- signals；
- hypotheses；
- predictions；
- outcomes；
- lessons；
- trade_ideas；
- smart_money_actions；
- patterns；
- 近期 market_bars。

### Parquet 存储

- 大量历史行情；
- 长期分钟线；
- 批量期权快照；
- 回测样本。

### DuckDB

用于离线分析和批量回测查询。

后期如果需要多人协作或大量实时数据，再迁移到 PostgreSQL / TimescaleDB / ClickHouse。

---

# 10. 终态日常运行流程

## 盘前

系统生成：

- Market Brief；
- 主导叙事；
- 今日风险；
- 重点标的；
- 可能盘面剧本；
- 今日禁止动作；
- 关注价位与验证点。

用户做：

- 读盘前简报；
- 确定今日关注标的；
- 设置提醒；
- 决定今天主动交易、轻仓观察，还是不交易。

## 开盘后 30–60 分钟

系统判断：

- 盘前剧本是否成立；
- 是否先空后多；
- 是否多空双杀；
- 是否锯齿震荡；
- 是否单边趋势；
- 是否需要切换剧本。

## 盘中

系统只在重要条件触发时提醒：

- 回踩到位；
- 结构确认；
- 结构失效；
- 交易机会形成；
- 剧本切换；
- 风险上升。

## 收盘后

系统生成：

- 当日复盘；
- 假说验证；
- 机会结果；
- 执行偏差；
- lesson 更新。

## 周末

系统生成：

- 本周规律回顾；
- 新规律探索；
- 失效模式；
- 交易员 / Smart Money 权重更新；
- 下周观察重点。

---

# 11. MVP 范围

MVP 不做全市场，不做自动下单，不做高频交易。

## MVP 标的池

```text
TSLA
TSLL
QQQ
SPY
ARKK
NVDA
COIN
BMNR
```

## MVP 核心能力

1. 数据接入；
2. 市场状态卡；
3. 日内结构卡；
4. Smart Money / 对手盘解释卡；
5. 技术结构解释卡；
6. 交易机会候选卡；
7. 1D / 3D / 5D 复盘；
8. 经验库写入；
9. Web Dashboard 展示。

## MVP 不做

- 自动交易；
- 全量期权链；
- Level 2；
- tick 数据；
- 实时 dark pool；
- 复杂组合优化；
- 多用户权限；
- 深度强化学习；
- 高价 institutional data。

---

# 12. 成功标准

MVP 成功标准不是赚钱，而是：

1. 每天能稳定生成 Market Brief；
2. 能主动发现至少 3 类市场异常；
3. 能生成符合输出合同的 LLM 解释；
4. 每个假说都有验证点和失效条件；
5. 1D / 3D / 5D 结果能自动回填；
6. 收盘后能生成复盘；
7. lessons 能被保存并在后续解释中引用；
8. 用户能通过 Dashboard 理解今天市场状态、重点机会和风险；
9. 系统不会把低置信叙事写成事实；
10. 系统能明确区分观察、setup forming、trade candidate。

---

# 13. 总结

本系统的本质是：

```text
数据接入
→ 特征与事件抽取
→ 市场状态识别
→ LLM 多假说解释
→ 前瞻验证点
→ 交易机会评分
→ 风控计划
→ 收盘复盘
→ 经验库更新
```

它的长期目标不是替用户做决定，而是持续压缩用户的判断噪声，让交易从情绪化反应变成结构化假说验证过程。
