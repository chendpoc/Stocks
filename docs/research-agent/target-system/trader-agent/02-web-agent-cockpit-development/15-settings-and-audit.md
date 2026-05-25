# 15 Settings and Audit

## 目标与非目标

目标：

实现 `/settings` 和 `/audit` 的最小开发边界。Settings 只承载 cockpit 用户偏好和安全可展示配置；Audit 提供关键动作的查询、过滤和详情查看。

非目标：

- 不在 settings 暴露 API key 或 secrets。
- 不允许前端删除或修改 audit log。
- 不把 settings 做成所有平台配置的万能后台。
- 不在 audit 页审批或回滚动作。

## 对应 PRD 范围

`02-web-agent-cockpit-prd.md` 只列出 `/settings` 和 `/audit` 路由，未细化页面。本模块定义 MVP 最小边界：

- `/settings`: cockpit display preferences, watchlist preferences, notification preferences, safe defaults.
- `/audit`: read-only audit list and detail.

## 页面/组件拆分

| Route | Component | Responsibility |
|---|---|---|
| `/settings` | `SettingsPage` | settings route shell |
| `/settings` | `DisplayPreferencesForm` | density, theme mode, chart defaults |
| `/settings` | `WatchlistPreferencesForm` | default watchlist and route defaults |
| `/settings` | `NotificationPreferencesForm` | inbox and browser notification settings |
| `/settings` | `PermissionSummaryPanel` | visible user permission summary |
| `/audit` | `AuditPage` | audit route shell |
| `/audit` | `AuditFilterBar` | actor, object, action, time range |
| `/audit` | `AuditTable` | immutable audit rows |
| `/audit` | `AuditDetailDrawer` | before/after summary, request id, linked object |

## 数据输入输出

Settings inputs:

- user profile
- cockpit preferences
- watchlist config visible to user
- notification config
- permission summary

Settings outputs:

- update cockpit preferences
- update notification preferences
- update default watchlist selection when permitted

Audit inputs:

- audit log entries
- linked object metadata

Audit outputs:

- filter audit rows
- open linked object
- export when `export_data` is granted

## API、WebSocket、SSE 事件

REST:

- `GET /api/config/cockpit-preferences`
- `POST /api/config/cockpit-preferences`
- `GET /api/config/notification-preferences`
- `POST /api/config/notification-preferences`
- `GET /api/auth/me`
- `GET /api/audit`
- `GET /api/audit/{audit_id}`
- `POST /api/audit/export` when permitted

Realtime:

- `/ws/events`: audit-related object updates can invalidate audit queries.
- `/ws/approvals`: approval decisions can append audit entries.

SSE:

- Not required.

## TanStack Query key 与 Zustand UI state 边界

TanStack Query:

- `["cockpit", "preferences"]`
- `["cockpit", "notification-preferences"]`
- `["cockpit", "me"]`
- `["cockpit", "audit", filters]`
- `["cockpit", "audit-entry", auditId]`

Zustand UI state:

- settings section tab
- audit selected id
- audit filter draft
- audit drawer open
- table density

Form state:

- settings forms use React Hook Form + Zod.

## 用户交互流程

Settings:

1. User opens `/settings`.
2. User edits display, watchlist or notification preferences.
3. Client validates form and submits to Config API.
4. Updated preferences apply to cockpit shell.

Audit:

1. User opens `/audit`.
2. User filters by action, actor, object type, object id or time.
3. User opens audit row.
4. Drawer shows immutable action summary, before/after summary, request id and linked object.
5. User exports only if permission allows.

## 权限、审批、审计要求

Required permissions:

- settings read/update own preferences.
- `view_audit` for audit route.
- `export_data` for audit export.

Approval required:

- Settings MVP does not change risk/capability policy directly.
- Policy changes route to Capability Center or Rule Studio approval paths.

Audit required:

- settings preference updates.
- audit export.
- permission summary view does not need high-severity audit unless platform requires it.

## 空态、loading、error、reconnect、dedupe 行为

| State | Behavior |
|---|---|
| Empty settings | initialize from platform defaults |
| Empty audit | show active filters and audit prerequisites |
| Loading | form and table skeletons |
| Error | retry and preserve unsaved form drafts |
| Reconnect | disable settings save and audit export |
| Dedupe | audit entries unique by audit id |

## 可复用现有代码

- Tailwind token preferences from current console.
- Shared form, table, drawer, tabs and badge primitives.
- Permission summary patterns from capability center.

## 实现任务

1. Create `/settings` and `/audit` routes.
2. Build settings forms for display, watchlist and notification preferences.
3. Build permission summary panel.
4. Build audit table, filter bar and detail drawer.
5. Wire settings mutations and audit query filters.
6. Add permission gates for audit route and export.
7. Add audit links from other modules to `/audit`.

## 功能验收标准

- User can update cockpit display and notification preferences.
- Settings never shows secrets.
- User with `view_audit` can query audit entries by actor, object, action and time.
- Audit detail is read-only and links to source object.
- Audit export is permission-gated and logged.

## 设计交互验收标准

- Settings is narrow and operational, not a platform admin sprawl.
- Audit table is dense, sortable and filterable.
- Audit detail highlights actor, action, object, timestamp and request id above raw data.
- Permission-denied audit route is explicit and non-destructive.

## 测试场景

- Unit test settings form schemas.
- Component test audit permission denied state.
- Component test audit export hidden without permission.
- Playwright flow: update display density, open audit entry, follow linked object.
