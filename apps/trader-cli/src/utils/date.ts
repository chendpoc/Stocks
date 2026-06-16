/** UTC calendar date `YYYY-MM-DD`. */
export function todayDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
