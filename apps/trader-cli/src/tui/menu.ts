export type ViewMode = "menu" | "content";

export type MenuId =
  | "dashboard"
  | "chat"
  | "signals"
  | "hypotheses"
  | "lessons"
  | "ops"
  | "settings";

export const MENU_ITEMS: { id: MenuId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "chat", label: "Chat" },
  { id: "signals", label: "Signals" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "lessons", label: "Lessons" },
  { id: "ops", label: "Ops" },
  { id: "settings", label: "Settings" },
];

export const MENU_KEYS: Record<string, MenuId> = {
  "1": "dashboard",
  "2": "chat",
  "3": "signals",
  "4": "hypotheses",
  "5": "lessons",
  "6": "ops",
  "7": "settings",
};

export const MENU_HINTS: Record<MenuId, string> = {
  dashboard:
    "[x]←→换标的 · []周期 · ↑↓滚日报 · [f]行情 · [g]日报 · [c]K线全屏 · [l]长桥TUI · [L]长桥K线",
  chat: "与 Agent 对话 · Tab 补全 · Enter 发送 · 等待时显示 loading",
  signals: "信号列表 · [s] scan · 显示 pattern/cross 摘要",
  hypotheses: "历史假设 · [↑↓] 选择 [Enter] 详情 [r] 刷新",
  lessons: "复盘 lesson · [↑↓] 选择 [Enter] 详情 [r] 刷新",
  ops: "Server [S]/[X] · 行情 [I] · 新闻 [N] · [R] 刷新 status",
  settings: "行情源 ↑↓ Enter 写入 .env · auto/yfinance/alpha_vantage",
};

export function menuIndex(id: MenuId): number {
  const idx = MENU_ITEMS.findIndex((item) => item.id === id);
  return idx >= 0 ? idx : 0;
}
