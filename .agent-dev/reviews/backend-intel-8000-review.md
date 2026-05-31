# Review: Backend 8000 无 Intel 路由

**日期**: 2026-05-31  
**范围**: `apps/trader-agent/backend/app/main.py`、`package.json` 启动脚本、运行时 `:8000`  
**结论**: 代码与工作区可挂载 Intel；**运行时 8000 应答的是未挂载 Intel 的旧进程**（非「Intel 模块坏了」）。

---

## 执行摘要

| 维度 | 结论 |
|------|------|
| 源码（工作区） | ✅ `main.py` 已 `include_router(intel_router, prefix="/api/intel")`，import 后 **18** 条 intel 路由 |
| 源码（git HEAD） | ❌ **未提交**，HEAD 的 `main.py` **无** `intel_router` |
| 运行时 `:8000` | ❌ `/health` 仅 `{"status":"ok"}`，OpenAPI **0** 条 `/intel`，ingest **404** |
| `/docs` 无 intel | ✅ 与 OpenAPI 一致，属同一根因 |
| 推荐根因 | **C — 端口被旧 uvicorn 占用**；新 `dev_server` / uvicorn 绑定失败或未执行 |

---

## 证据

### 1. 磁盘代码正常

```text
python -c "import app.main"  → intel routes: 18
TestClient(create_app())     → POST /api/intel/market/ingest → 200
```

### 2. 线上 8000 是旧应用

```text
GET  /health              → {"status":"ok"}           # 无 intel_route_count
GET  /openapi.json        → paths: 14, intel: 0      # 仅 agent 等旧路由
POST /api/intel/market/ingest → 404
```

### 3. `dev_server.py` 预检（复现）

```text
ERROR: http://127.0.0.1:8000 is in use but intel is NOT mounted (health={'status': 'ok'}).
Another process is answering on 8000 — your new uvicorn never bound the port.
```

### 4. git HEAD 与工作区不一致

- `git show HEAD:apps/trader-agent/backend/app/main.py` → **不含** `intel_router`、`intel_route_count`
- 工作区 `git diff` → 已添加 intel 挂载（**未 commit**）

旧进程若由 HEAD 代码或热重载前的 `app.main:app` 启动，Swagger 不会出现 intel。

### 5. 空闲端口验证（历史会话）

同命令在 **8013** 启动时：OpenAPI 含 intel，`ingest` 200。说明 **启动命令 + 代码** 在端口可用时正确。

---

## 根因判定（排除法）

| 假设 | 判定 |
|------|------|
| A. `intel/` 模块损坏 | ❌ import 与 TestClient 正常 |
| B. `main.py` 未挂载 router（工作区） | ❌ 已挂载 |
| B'. HEAD 未合并 intel | ⚠️ 若进程来自旧提交，则无 intel |
| C. 8000 旧进程占位 | ✅ **主因**（health/OpenAPI/dev_server 一致） |
| D. CLI URL 错误 | ❌ `TRADER_API_BASE=.../api/intel` 正确 |

---

## Findings

| ID | 严重度 | 发现 |
|----|--------|------|
| F1 | **Blocker** | `:8000` HTTP 应答进程无 `/api/intel`，导致 `/docs` 无 intel、CLI 404 |
| F2 | **Major** | `main.py` intel 改动**未提交**；团队/其他终端若用旧代码启动，永不出现 intel |
| F3 | **Major** | Windows 多终端 + `--reload` 易留下监听；`backend:stop` 对僵尸 PID 可能无效 |
| F4 | Minor | 曾回退 `package.json` 为 `app.main:app` 直启，端口占用时仍无法自愈 |

---

## 用户操作清单（修复运行时）

1. **关闭**所有运行 `trader-agent:backend:dev` 的终端（Ctrl+C）。
2. `npm run trader-agent:backend:stop`
3. 若仍失败：`Get-NetTCPConnection -LocalPort 8000 -State Listen` → 任务管理器结束对应 `python.exe`。
4. `npm run trader-agent:backend:dev`（应走 `dev_server.py` + `--factory`）。
5. 验证：
   - `curl http://127.0.0.1:8000/health` → 含 **`intel_route_count` ≥ 14**
   - `npm run trader-agent:intel:ping` → ingest 200
   - `http://localhost:8000/docs` → 出现 **intel-*** 标签

---

## 仓库建议（非阻塞）

1. **提交** `main.py`（及 `test_health.py`）intel 挂载，避免 HEAD 与运行预期不一致。
2. 坚持使用 `dev_server.py` + `backend:stop`，勿改回裸 `app.main:app`。
3. 可选：CI/本地 smoke 断言 `/health` 的 `intel_route_count`。

---

## 判定：当前 `npm run trader-agent:backend:dev` 是否正确？

- **脚本设计（当前 `package.json`）**：✅ 正确（stop → dev_server → factory uvicorn）。
- **你看到的 `/docs`**：❌ 不代表脚本失败，代表 **8000 上仍在跑旧实例**；需先清端口再启动。
