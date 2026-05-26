# 15 Settings and Tool Sources

## 目标与非目标

目标：实现 `/settings` 的第一版边界：本地显示偏好、polling 设置和轻量 Tool Settings。

非目标：

- 不做独立 capability center。
- 不做权限升级。
- 不做工具审批。
- 不显示 API key 或 secrets。
- 不做 audit center。

## 页面/组件拆分

| Component | Responsibility |
|---|---|
| `SettingsPage` | route composition |
| `DisplayPreferencePanel` | density, theme, layout preferences |
| `PollingPreferencePanel` | default interval and manual-refresh preference |
| `ToolSettingsPanel` | enabled read-only tools display |
| `ToolSourceLegend` | explains tool source badges and unverified markers |

## Tool Settings

First version defaults to enabled read-only tools:

```text
market_snapshot
news_search
web_search
knowledge_search
rulepack_search
deepseek_chat
```

Settings page may show them and allow local display preferences, but does not manage backend permission.

## 数据输入输出

Inputs:

- local preferences
- configured tool source metadata

Outputs:

- update local density/theme/polling preference
- view tool source meanings

## 验收标准

- User can see which readonly tools are available to Agent answers.
- User can understand `external_unverified` source marking.
- User can set dashboard polling preference.
- No secret, API key, permission change, approval or upgrade action appears.

## 测试场景

- Component test polling preference options.
- Component test tool source legend.
- Component test no secrets rendered.
