# CLI TUI 功能集成（T003）

> 父 spec：[cli-tui-v2](../cli-tui-v2/spec.md)（T002 保持 completed）  
> 结构化约束：[spec.json](./spec.json) · 决策：[decision-record.json](./decision-record.json)  
> 编排：[T003.json](../../tasks/T003.json) · Slices：[T003-slices](../../tasks/T003-slices/)

## 动机

T002 将 report/chart/scan/ingest/server 等做成 Commander 子命令，TUI 仅有 P0 壳子 + Chat。本 spec 把能力 **接入七页 ink TUI**，并通过 `services/` 与 CLI 共享逻辑。

## 交付

1. `GET /market/status` 只读行情状态（D204）
2. `apps/trader-cli/src/services/*` + commands 瘦身（D201）
3. 七页菜单：新增 Hypotheses、Ops；Dashboard 指挥中心（D202/D203）
4. 按 T003-slices 串行开发与验收（D206）

## 非目标

见 spec.json `non_goals`。
