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
