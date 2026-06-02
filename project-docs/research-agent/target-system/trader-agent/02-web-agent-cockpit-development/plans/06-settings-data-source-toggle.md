# 06 — Settings 页面 Mock/Real 数据源切换

Status: draft
Owner: cursor-composer
Created: 2026-05-28
Source: 对话需求 — Settings 页面动态切换数据源，替代环境变量

## 1. 目标

在 Cockpit Settings 页面加一个 Mock/Real 数据源切换开关。用户切换后立即生效（TanStack Query 自动重新请求），刷新页面保持选择（localStorage 持久化）。不再需要每次改环境变量或重启 dev server。

## 2. 非目标

- 不修改后端 API
- 不修改 Dashboard 或其他页面组件
- 不改变 mock / real adapter 的实现逻辑
- 不删除 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER` 环境变量（保留作为初始默认值）

## 3. 背景与现状

当前切换方式：
- 设置 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER=1` 环境变量
- 重启 `pnpm dev` 生效

期望方式：
- Settings 页面点一个开关
- 立即生效，无需重启

## 4. 方案摘要

**4.1 存储层：Zustand + localStorage**

在 `use-cockpit-ui-store.ts` 新增 `dataSource: "mock" | "real"` 字段，读写 localStorage key `trader-cockpit.dataSource`。默认值读取逻辑：
1. 若 `NEXT_PUBLIC_COCKPIT_REAL_ADAPTER === "1"`，默认 `"real"`
2. 否则从 localStorage 读取，无记录则默认 `"mock"`

**4.2 Adapter 层：Proxy 动态分发**

`adapter.ts` 中 `cockpitAdapter` 改为 Proxy 对象，每次方法调用时检查 localStorage 当前值，分发到 mock 或 real adapter。这样不需要 `useQueryClient.invalidateQueries()` —— 因为 queryFn 本身就是动态的。

```ts
// adapter.ts 核心逻辑
function resolveAdapter(): CockpitDataAdapter {
  if (typeof window === "undefined") return mockCockpitAdapter;
  const ds = window.localStorage.getItem("trader-cockpit.dataSource");
  return ds === "real" ? realReadonlyAdapter : mockCockpitAdapter;
}

export const cockpitAdapter = new Proxy({} as CockpitDataAdapter, {
  get(_, method: string) {
    const adapter = resolveAdapter();
    const fn = (adapter as Record<string, unknown>)[method];
    return typeof fn === "function" ? fn.bind(adapter) : fn;
  },
});
```

**4.3 UI 层：Settings 页面加开关**

在 `SettingsWorkspace.tsx` 的 "本地显示偏好" 区域加一个 `<select>` 或 toggle：

```
数据源:  [ Mock 数据 ▼ ]   ← 默认
         [ 真实 API ]
```

切换时调用 `setDataSource()`，Zustand 自动写 localStorage。

## 5. 允许修改的文件

- `apps/trader-cockpit/lib/cockpit/use-cockpit-ui-store.ts`
- `apps/trader-cockpit/lib/cockpit/adapter.ts`
- `apps/trader-cockpit/components/cockpit/settings/SettingsWorkspace.tsx`
- `apps/trader-cockpit/lib/i18n/resources.json`（新增 "数据源" 相关文案，zh-CN + en-US）

## 6. 禁止修改的范围

- `apps/trader-agent/` 所有文件
- `apps/trader-cockpit/lib/cockpit/real-readonly-adapter.ts`
- `apps/trader-cockpit/lib/cockpit/mock-adapter.ts`
- `apps/trader-cockpit/components/cockpit/dashboard/` 所有文件
- `pnpm-lock.yaml` / `package.json`

## 7. 任务清单

- [ ] Task 1: Zustand store 加 `dataSource` + localStorage 读写
- [ ] Task 2: `adapter.ts` 改为 Proxy 动态分发
- [ ] Task 3: Settings 页面加数据源切换 UI
- [ ] Task 4: i18n 加中英文案
- [ ] Task 5: lint + build + test

## 8. 验收标准

- Settings 页面有 Mock/Real 下拉选择
- 切换到 Real 后，Dashboard 刷新显示真实 API 数据（需要后端运行 + signals 表有数据）
- 切换到 Mock 后，Dashboard 恢复 mock 数据
- 刷新页面后，选择保持
- `pnpm --filter trader-cockpit lint` 通过
- `pnpm --filter trader-cockpit build` 通过
- `node --test test/trader-cockpit-phase0.test.mjs` 不增加失败数

## 9. Cursor Composer 可执行 Prompt

```text
Implement plan 06 from project-docs/research-agent/target-system/trader-agent/02-web-agent-cockpit-development/plans/06-settings-data-source-toggle.md.

Goal: add a Mock/Real data source toggle to the Cockpit Settings page, persisted in localStorage, so the user can switch data sources without restarting the dev server.

Four files to modify:

**1. apps/trader-cockpit/lib/cockpit/use-cockpit-ui-store.ts**
- Add type `CockpitDataSource = "mock" | "real"` to exports
- Add `DATA_SOURCE_STORAGE_KEY = "trader-cockpit.dataSource"` constant
- Add `readStoredDataSource()` helper: returns "real" if localStorage says so, else "mock"
- Add `storeDataSource(source)` helper: writes to localStorage
- Add `dataSource: CockpitDataSource` to the state type
- Add `setDataSource: (dataSource: CockpitDataSource) => void` to the state type
- Default value: `dataSource: readStoredDataSource()`
- Setter: `setDataSource: (ds) => { storeDataSource(ds); set({ dataSource: ds }); }`

**2. apps/trader-cockpit/lib/cockpit/adapter.ts**
- Replace the current env-var-based export with a Proxy pattern:
  - Import mockCockpitAdapter and realReadonlyAdapter
  - Create `resolveAdapter()` that reads localStorage key "trader-cockpit.dataSource"
  - Export `cockpitAdapter` as a Proxy that calls resolveAdapter() on each method access
  - Keep `export { mockCockpitAdapter }` for direct imports
  - Remove the `const useRealAdapter` / `process.env` logic (ENV VAR IS NO LONGER NEEDED for this toggle)

**3. apps/trader-cockpit/components/cockpit/settings/SettingsWorkspace.tsx**
- Import useCockpitUiStore and add dataSource/setDataSource selectors
- Add a new setting row between "Density" and "Chart Timeframe":
  <label>
    <span>数据源</span>
    <select value={dataSource} onChange={...}>
      <option value="mock">Mock 数据</option>
      <option value="real">真实 API</option>
    </select>
  </label>

**4. apps/trader-cockpit/lib/i18n/resources.json**
- Add under both zh-CN.translation.settings and en-US.translation.settings:
  "dataSource": "数据源" / "Data Source"
  "dataSourceMock": "Mock 数据" / "Mock Data"
  "dataSourceReal": "真实 API" / "Real API"

Hard boundaries:
- Do not change real-readonly-adapter.ts or mock-adapter.ts
- Do not modify Dashboard or any other page component
- Do not touch backend code
- Use existing CSS patterns (same markup style as the language/density selects)

Required verification:
- pnpm --filter trader-cockpit lint
- pnpm --filter trader-cockpit build

Return the changed files, the commands you ran, and any failed command output.
```

## 10. 完成后文档更新

- [ ] 更新 `00-implementation-status.md`
- [ ] 本 plan `Status: done`
