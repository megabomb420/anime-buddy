/**
 * Deterministic "can I finish this in X minutes" check for Tonight picks.
 *
 * No episode-duration field in the catalog model, so:
 *   - MOVIE counts as ~100 minutes
 *   - series count episodes × 24 minutes
 *   - unknown episode counts never fit a finite budget (airing long-runners
 *     can't be "finished tonight")
 */
import type { AnimeSummary } from "@/types/anime";

export const EPISODE_MINUTES = 24;
export const MOVIE_MINUTES = 100;

export function estimatedMinutes(anime: Pick<AnimeSummary, "format" | "episodes">): number | null {
  if (anime.format === "MOVIE") return MOVIE_MINUTES;
  if (anime.episodes && anime.episodes > 0) return anime.episodes * EPISODE_MINUTES;
  return null;
}

export function fitsTimeBudget(
  anime: Pick<AnimeSummary, "format" | "episodes">,
  minutes: number,
): boolean {
  const est = estimatedMinutes(anime);
  return est !== null && est <= minutes;
}
