import type { AnimeSummary } from "../types/anime.ts";

const UPCOMING_ASK = /\b(upcoming|not yet released|future release|zapowied|nadchodz|premier)\w*/i;

/** Normal watch recommendations must be playable now, not future catalog entries. */
export function allowsUpcomingTitles(query: string): boolean {
  return UPCOMING_ASK.test(query);
}

export function isWatchableNow(anime: Pick<AnimeSummary, "status">): boolean {
  return anime.status !== "NOT_YET_RELEASED" && anime.status !== "CANCELLED";
}
