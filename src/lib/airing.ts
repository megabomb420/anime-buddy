/**
 * Human countdown for the next airing episode ("in 2d", "out now").
 * Pure function over epoch ms so it is trivially testable.
 */

export function airingCountdownLabel(airingAt: number, now = Date.now()): string {
  const diff = airingAt - now;
  if (diff <= 0) return "out now";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "in <1h";
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "in 1w" : `in ${weeks}w`;
}

/** Seven days in ms — window for the "This week" rail. */
export const AIRING_WEEK_MS = 7 * 24 * 3_600_000;

function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Calendar-style label for the "This week" rail:
 * "out now" / "today" / "tomorrow" / short weekday ("Fri").
 */
export function airingWeekdayLabel(airingAt: number, now = Date.now()): string {
  if (airingAt <= now) return "out now";
  const dayDiff = Math.round((startOfLocalDay(airingAt) - startOfLocalDay(now)) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "tomorrow";
  return new Date(airingAt).toLocaleDateString("en-US", { weekday: "short" });
}
