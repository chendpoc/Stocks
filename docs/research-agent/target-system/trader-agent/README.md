# 交易员认知型自学习交易 Agent 目标系统

版本：`v0.2`

状态：最终系统 source of truth，后续开发唯一依据。

本目录定义后续重构开发必须遵循的完整目标系统。旧阶段路线已放弃，后续不再以 `docs/research-agent/trading-workbench-master-plan.md` 或既有 `docs/research-agent/modules/` 作为开发路线。

最终实现路径是新的 monorepo 子项目 `apps/trader-agent/`。当前 `apps/research-console` 只是已有实现资产和验证场，后续只能作为迁移素材，不能作为最终 trader-agent 产品路径继续扩展。

## 定位关系

- `docs/research-agent/target-system/trader-agent/`：最终系统定义，作为产品、架构和实施依据。
- `docs/research-agent/trading-workbench-master-plan.md`：旧阶段路线，已 superseded，仅保留为历史实现记录。
- `docs/research-agent/modules/`：旧模块切片和历史实现记录，可作为迁移素材，但不再决定后续开发方向。
- `apps/trader-agent/`：新的独立 monorepo 子项目，后续承载 Agent Core Backend、Web Agent Cockpit 和共享契约。
- `apps/research-console`：现有前端/服务端实现资产，只作为迁移参考。

## 使用原则

1. 后续开发先读本目录文档，并以本目录为唯一权威目标。
2. 新实现计划必须从 `03-shared-platform-roadmap-prd.md` 的 Phase 0 开始重新拆分，而不是沿用旧 master plan。
3. 旧 `modules/` 文档只能用于识别已实现资产、可复用代码和迁移风险。
4. 若本目录文档和旧阶段路线冲突，一律以本目录文档为准。

## 阅读顺序

1. [00-system-overview.md](./00-system-overview.md)：建立系统边界、三层架构和 MVP 范围。
2. [01-agent-core-backend-prd.md](./01-agent-core-backend-prd.md)：拆解 Agent 大脑、规则、风控、学习闭环。
3. [02-web-agent-cockpit-prd.md](./02-web-agent-cockpit-prd.md)：拆解 Agent Market Cockpit、市场意图解释、机会关注、Agent 对话和交易规律学习。
4. [02-web-agent-cockpit-development/README.md](./02-web-agent-cockpit-development/README.md)：进入 Web Cockpit 实施前，确认第一版 route、mock fallback、只读接入和非目标。
5. [02-web-agent-cockpit-development/01-agent-core-to-cockpit-contract-gap-review.md](./02-web-agent-cockpit-development/01-agent-core-to-cockpit-contract-gap-review.md)：进入 Web Cockpit 真实接入前，确认当前 Agent Core API 与 Cockpit contract 缺口。
6. [03-shared-platform-roadmap-prd.md](./03-shared-platform-roadmap-prd.md)：拆解数据库、事件总线、工具网关、RulePack、开发路线和验收标准。
7. [04-ai-rag-mcp-platform-roadmap-prd.md](./04-ai-rag-mcp-platform-roadmap-prd.md)：拆解 AI 模型、RAG、MCP、市场工具和轻量化升级路线。
8. [05-agent-workflow-orchestration-roadmap.md](./05-agent-workflow-orchestration-roadmap.md)：定义未来 agent task orchestration、workflow runtime、只读 run viewer 和 workflow builder 的跨层边界。
9. [03-shared-agent-memory-prd.md](./03-shared-agent-memory-prd.md)：定义本地资料库索引、候选记忆、长期金融记忆、上下文注入和审计重建。
10. [03-shared-agent-memory-development/README.md](./03-shared-agent-memory-development/README.md)：进入 Shared Agent Memory 开发前，确认 artifact catalog、Markdown heading chunk、FTS5、candidate review 和 audit/rebuild 设计。
11. [01-agent-core-implementation-plan.md](./01-agent-core-implementation-plan.md)：Agent Core 第一版可执行开发计划。

## 开发约束

- 不再扩展旧的本地研究工作台路线；后续工作应围绕 trader-agent 目标系统重构。
- 旧代码必须接受目标系统重新分层：Agent Core Backend、Web Agent Cockpit、Shared Platform Layer。
- 任何新模块都应说明它对应本目录哪一层、哪个模块、哪个验收标准。
- 当前 Web Cockpit 第一版不包含自动执行、实盘下单、模拟账户交易或订单审批中心；这些能力如未来需要，必须重新立项并补齐规则、风控和审批边界。
