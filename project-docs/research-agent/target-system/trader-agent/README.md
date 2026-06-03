# 交易员认知型自学习交易 Agent 目标系统

版本：`v0.2`

状态：最终系统 source of truth，后续开发唯一依据。

本目录定义后续重构开发必须遵循的完整目标系统。旧阶段路线已放弃，后续不再以 `project-docs/archive/research-console/` 或 `project-docs/archive/trader-cockpit/` 作为开发路线。

当前实现路径是 `apps/trader-agent/backend`、`apps/trader-agent/shared`、`apps/trader-workflows` 和 `apps/trader-cli`。`apps/research-console` 与 `apps/trader-cockpit` 已移除；相关文档仅保留在 `project-docs/archive/` 作为历史材料。

## 定位关系

- `project-docs/research-agent/target-system/trader-agent/`：最终系统定义，作为产品、架构和实施依据。
- `project-docs/archive/research-console/`：旧 research-console / workbench 路线，仅保留历史记录。
- `project-docs/archive/trader-cockpit/`：已移除 Web Cockpit 路线，仅保留历史记录。
- `apps/trader-agent/backend`：Agent Core Backend、领域 API、数据、规则、记忆和工具服务。
- `apps/trader-agent/shared`：RulePack 与共享 fixture/契约。
- `apps/trader-workflows`：Stage 1 workflow runtime 与 LangGraph graphs。
- `apps/trader-cli`：CLI / TUI 操作入口。

## 使用原则

1. 后续开发先读本目录文档，并以本目录为唯一权威目标。
2. 新实现计划必须围绕 backend/shared/workflows/CLI 拆分，不沿用旧 Web UI 路线。
3. 归档文档只能用于历史考证，不能决定当前实现方向。
4. 若本目录文档和归档路线冲突，一律以本目录文档为准。

## 阅读顺序

1. [00-system-overview.md](./00-system-overview.md)：建立系统边界、三层架构和 MVP 范围。
2. [00-workflow-router.md](./00-workflow-router.md)：选择 source-of-truth、主 workflow、spec gate 和 review gate。
3. [01-agent-core-backend-prd.md](./01-agent-core-backend-prd.md)：拆解 Agent 大脑、规则、风控、学习闭环。
4. [03-shared-platform-roadmap-prd.md](./03-shared-platform-roadmap-prd.md)：拆解数据库、事件总线、工具网关、RulePack、开发路线和验收标准。
5. [04-ai-rag-mcp-platform-roadmap-prd.md](./04-ai-rag-mcp-platform-roadmap-prd.md)：拆解 AI 模型、RAG、MCP、市场工具和轻量化升级路线。
6. [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md)：定义 workflow runtime、run tracking 和 workflow orchestration 的跨层边界。
7. [06-self-learning-market-judgment-model-roadmap.md](./06-self-learning-market-judgment-model-roadmap.md)：定义 Alpha Research、Market Judgment 和 Model Learning 三条未来自学习路线。
8. [07-backlog-roadmap-index.md](./07-backlog-roadmap-index.md)：按 Now / Next / Later / Blocked by Contract 收敛已记录 backlog。
9. [08-agent-engineering-principles-proposal.md](./08-agent-engineering-principles-proposal.md)：沉淀 agent harness、上下文工程、tool/MCP、skills、policy check 和 alpha workflow 的完整 proposal。
10. [03-shared-agent-memory-prd.md](./03-shared-agent-memory-prd.md)：定义本地资料库索引、候选记忆、长期金融记忆、上下文注入和审计重建。
11. [03-shared-agent-memory-development/README.md](./03-shared-agent-memory-development/README.md)：进入 Shared Agent Memory 开发前，确认 artifact catalog、Markdown heading chunk、FTS5、candidate review 和 audit/rebuild 设计。
12. [01-agent-core-implementation-plan.md](./01-agent-core-implementation-plan.md)：Agent Core 第一版可执行开发计划。

## 开发约束

- 不再扩展旧的本地研究工作台或 Web Cockpit 路线；后续工作应围绕 trader-agent backend/shared/workflows/CLI 重构。
- 旧文档必须接受目标系统重新分层：Agent Core Backend、workflow runtime、CLI/TUI operator interface、Shared Platform Layer。
- 任何新模块都应说明它对应本目录哪一层、哪个模块、哪个验收标准。
- 当前版本不包含自动执行、实盘下单、模拟账户交易或订单审批中心；这些能力如未来需要，必须重新立项并补齐规则、风控和审批边界。
