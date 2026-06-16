import { getFixedWakeConfig } from "./wakeSchedule.js";
import type { MarketDayType } from "./wakeSchedule.js";

export function resolveDaemonSessionKey(
  hour: number,
  dayType: MarketDayType,
): keyof ReturnType<typeof getFixedWakeConfig> {
  if (dayType === "weekend") return "weekend";
  if (dayType === "holiday") return "holiday";
  if (dayType === "half_day") return "halfDay";

  if (hour >= 4 && hour < 9) return "preMarket";
  if (hour >= 9 && hour < 16) return "marketOpen";
  if (hour >= 16 && hour < 20) return "postMarket";
  return "marketClosed";
}

export function getDaemonWakeIntervalMs(dayType: MarketDayType, hour: number): number {
  const config = getFixedWakeConfig();
  const key = resolveDaemonSessionKey(hour, dayType);
  const session = config[key];
  return session.intervalMinutes * 60 * 1000;
}
