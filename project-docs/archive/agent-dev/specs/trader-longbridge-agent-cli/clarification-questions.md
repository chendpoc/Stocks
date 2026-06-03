# Clarification — trader-longbridge-agent-cli

Grill-me 会话已闭合，决定见 `decision-record.json`。

## Q001: Settings 与 MARKET_DATA_PROVIDER？

**决定**: B — `TRADER_LONGBRIDGE_AGENT` 独立，默认 on。

## Q002: 工具形态？

**决定**: C 混合；禁止任何下单。

## Q003: 标的？

**决定**: A — 无后缀 `.US`。

## Q004: Settings UI？

**决定**: A — 双区块。

## Q005: intel vs 长桥？

**决定**: on 时客观事实优先长桥；B 工具描述 + SYSTEM_PROMPT 补丁。

## Q006: 探测失败？

**决定**: 写 `off` + Settings warning（非静默假 off）。

## Q007: 输出？

**决定**: C 分页默认 + 256KB 截断。

## Q008: 何时探测？

**决定**: 每次 `trader` 启动 + Settings 选 on 前 probe（C）。
