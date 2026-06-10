/**
 * Daemon Wake Schedule — 唤醒配置系统
 *
 * 两层配置:
 *   1. defaults  — 硬编码默认值（盘前/盘中/盘后/闭市/周末）
 *   2. override  — 运行时持久化覆盖（data/daemon-wake-config.json）
 *
 * 启动时 merge: { ...defaults, ...override }
 * CLI 命令修改 override，下次启动生效。
 *
 * 设计原则:
 *   - 默认值硬编码（零依赖启动）
 *   - override 文件不存在时不报错
 *   - 动态唤醒任务仅存内存（重启丢失，符合预期——Agent 应在下次醒来时重新评估）
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── 类型 ─────────────────────────────────────────────────

export interface SessionWakeConfig {
  /** 固定唤醒间隔（分钟） */
  intervalMinutes: number;
}

export interface FixedWakeConfig {
  preMarket: SessionWakeConfig;
  marketOpen: SessionWakeConfig;
  postMarket: SessionWakeConfig;
  marketClosed: SessionWakeConfig;
  weekend: SessionWakeConfig;
  holiday: SessionWakeConfig;
  halfDay: SessionWakeConfig;
}

export interface DynamicWakeTask {
  id: string;
  at: Date;
  reason: string;
  priority: "high" | "normal";
  createdBy: string;
  expiresAt: Date;
}

export interface WakeConfig {
  fixed: FixedWakeConfig;
  dynamic: DynamicWakeTask[];
}

// ─── 类型扩展 ─────────────────────────────────────────────

/** 市场时段枚举: Daemon 根据日期自动判断 */
export type MarketDayType = "regular" | "holiday" | "half_day" | "weekend";

// ─── 节假日（动态查询 + 本地缓存）───────────────────────────

/**
 * 节假日缓存结构。
 * 每年年初 Daemon 启动时通过 webSearch 查询 NYSE calendar 并写入缓存。
 * 缓存有效期: 当年 12/31。过期自动重新查询。
 */
interface HolidayCache {
  updatedAt: string;
  year: number;
  holidays: Record<string, string>;  // "2026-01-01" → "New Year's Day"
  halfDays: Record<string, string>;  // "2026-11-27" → "Black Friday"
}

const HOLIDAY_CACHE_FILE = path.resolve(
  process.env.MARKET_AGENT_DATA_DIR ?? path.join(process.cwd(), "data"),
  "holiday-cache.json",
);

function loadHolidayCache(): HolidayCache | null {
  try {
    const raw = fs.readFileSync(HOLIDAY_CACHE_FILE, "utf-8");
    const cache = JSON.parse(raw) as HolidayCache;
    // 缓存已过期（过了当年 12/31）
    const now = new Date();
    if (now.getFullYear() > cache.year) return null;
    return cache;
  } catch {
    return null;
  }
}

function saveHolidayCache(cache: HolidayCache): void {
  const dir = path.dirname(HOLIDAY_CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HOLIDAY_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

let _holidayCache: HolidayCache | null = null;

/** Daemon 启动时调用: 加载缓存或触发查询 */
export function initHolidayCache(): void {
  _holidayCache = loadHolidayCache();
}

/** Daemon 首次醒来时调用: 通过 webSearch + fetchUrl 获取当年 NYSE calendar */
export async function refreshHolidayCache(fetchUrl: (url: string) => Promise<string>): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();

  // 用 webSearch 查 NYSE holiday calendar
  const resp = await fetchUrl(
    `https://raw.githubusercontent.com/quantatrisk/nyse-holidays/main/nyse_${year}.json`,
  );
  // 降级: 如果 GitHub raw 不可用，使用内置 fallback
  let holidays: Record<string, string>;
  let halfDays: Record<string, string>;
  try {
    const data = JSON.parse(resp);
    holidays = data.holidays ?? {};
    halfDays = data.half_days ?? {};
  } catch {
    // Fallback: 上一年的缓存 + 周末判断仍可正常工作
    return;
  }

  _holidayCache = {
    updatedAt: now.toISOString(),
    year,
    holidays,
    halfDays,
  };
  saveHolidayCache(_holidayCache);
}

export function getMarketDayType(date: Date = new Date()): MarketDayType {
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return "weekend";

  // 缓存命中 → 精确判断
  if (_holidayCache) {
    const ymd = date.toISOString().slice(0, 10);
    if (_holidayCache.holidays[ymd]) return "holiday";
    if (_holidayCache.halfDays[ymd]) return "half_day";
    return "regular";
  }

  // 缓存未命中 → 仅用周末判断（安全降级: 假设所有工作日为 regular）
  return "regular";
}

// ─── 默认值 ───────────────────────────────────────────────

export const DEFAULT_WAKE_INTERVALS: FixedWakeConfig = {
  preMarket: { intervalMinutes: 5 }, // 盘前 1 小时 — 财报/新闻密集
  marketOpen: { intervalMinutes: 5 }, // 盘中 — 信号活跃
  postMarket: { intervalMinutes: 5 }, // 盘后 30 分钟 — 盘后财报
  marketClosed: { intervalMinutes: 180 }, // 闭市 — 变化极低
  weekend: { intervalMinutes: 360 }, // 周末 — 最低心跳
  holiday: { intervalMinutes: 720 }, // 节假日 — 休市无数据，仅心跳
  halfDay: { intervalMinutes: 30 },  // 半天交易日 — 后半段降频
};

// ─── override 文件路径 ────────────────────────────────────

const OVERRIDE_FILE = path.resolve(
  process.env.MARKET_AGENT_DATA_DIR ?? path.join(process.cwd(), "data"),
  "daemon-wake-config.json",
);

// ─── 读取 / 写入 ──────────────────────────────────────────

function loadOverride(): Partial<FixedWakeConfig> | null {
  try {
    const raw = fs.readFileSync(OVERRIDE_FILE, "utf-8");
    return JSON.parse(raw) as Partial<FixedWakeConfig>;
  } catch {
    return null;
  }
}

function saveOverride(config: Partial<FixedWakeConfig>): void {
  const dir = path.dirname(OVERRIDE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function mergeWakeConfigPatch(
  base: Partial<FixedWakeConfig>,
  patch: Partial<FixedWakeConfig>,
): Partial<FixedWakeConfig> {
  const next: Partial<FixedWakeConfig> = { ...base };
  for (const key of Object.keys(patch) as (keyof FixedWakeConfig)[]) {
    if (patch[key]) {
      next[key] = {
        ...(base[key] ?? {}),
        ...patch[key],
      };
    }
  }
  return next;
}

// ─── 运行时状态 ───────────────────────────────────────────

let currentFixedConfig: FixedWakeConfig = { ...DEFAULT_WAKE_INTERVALS };
let dynamicTasks: DynamicWakeTask[] = [];

/** 启动时调用：加载 override + default merge */
export function initWakeConfig(): void {
  const override = loadOverride();
  if (override) {
    currentFixedConfig = {
      preMarket: { ...DEFAULT_WAKE_INTERVALS.preMarket, ...override.preMarket },
      marketOpen: { ...DEFAULT_WAKE_INTERVALS.marketOpen, ...override.marketOpen },
      postMarket: { ...DEFAULT_WAKE_INTERVALS.postMarket, ...override.postMarket },
      marketClosed: { ...DEFAULT_WAKE_INTERVALS.marketClosed, ...override.marketClosed },
      weekend: { ...DEFAULT_WAKE_INTERVALS.weekend, ...override.weekend },
      holiday: { ...DEFAULT_WAKE_INTERVALS.holiday, ...override.holiday },
      halfDay: { ...DEFAULT_WAKE_INTERVALS.halfDay, ...override.halfDay },
    };
  }
}

/** 获取当前生效的固定配置 */
export function getFixedWakeConfig(): FixedWakeConfig {
  return currentFixedConfig;
}

/** 更新固定配置并持久化 */
export function updateFixedWakeConfig(patch: Partial<FixedWakeConfig>): void {
  currentFixedConfig = {
    preMarket: { ...currentFixedConfig.preMarket, ...patch.preMarket },
    marketOpen: { ...currentFixedConfig.marketOpen, ...patch.marketOpen },
    postMarket: { ...currentFixedConfig.postMarket, ...patch.postMarket },
    marketClosed: { ...currentFixedConfig.marketClosed, ...patch.marketClosed },
    weekend: { ...currentFixedConfig.weekend, ...patch.weekend },
    holiday: { ...currentFixedConfig.holiday, ...patch.holiday },
    halfDay: { ...currentFixedConfig.halfDay, ...patch.halfDay },
  };

  // 持久化只存 override，但要保留此前已写入的覆盖项。
  saveOverride(mergeWakeConfigPatch(loadOverride() ?? {}, patch));
}

/** 重置为默认值 */
export function resetFixedWakeConfig(): void {
  currentFixedConfig = { ...DEFAULT_WAKE_INTERVALS };
  saveOverride({});
}

// ─── 动态任务 ─────────────────────────────────────────────

/** Agent 通过 scheduleWakeup 工具添加动态唤醒 */
export function addDynamicTask(task: Omit<DynamicWakeTask, "id">): DynamicWakeTask {
  const id = `dyn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: DynamicWakeTask = { ...task, id };
  dynamicTasks.push(full);
  return full;
}

/** 获取所有未过期的动态任务 */
export function getActiveDynamicTasks(): DynamicWakeTask[] {
  const now = new Date();
  dynamicTasks = dynamicTasks.filter((t) => t.expiresAt > now);
  return dynamicTasks;
}

/** 删除指定动态任务 */
export function removeDynamicTask(id: string): boolean {
  const len = dynamicTasks.length;
  dynamicTasks = dynamicTasks.filter((t) => t.id !== id);
  return dynamicTasks.length < len;
}
