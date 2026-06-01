/** 用户偏好研究标的（UI 快选 / 批量 scan 默认范围，非系统硬限制） */
export const PREFERRED_SYMBOLS = [
  "TSLA",
  "TSLL",
  "QQQ",
  "SPY",
  "ARKK",
  "NVDA",
  "COIN",
  "BMNR",
] as const;

/** @deprecated 别名，逐步改用 PREFERRED_SYMBOLS */
export const MVP_SYMBOLS: readonly string[] = PREFERRED_SYMBOLS;

export const PREFERRED_SYMBOLS_LABEL = PREFERRED_SYMBOLS.join("、");
