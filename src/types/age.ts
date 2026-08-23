/**
 * Age guidance model.
 *
 * Rules (from product spec):
 * - Every anime must support an age guidance field.
 * - The SOURCE of a rating must always be distinguishable.
 * - Priority: TMDB regional certification (selected region) >
 *   other clearly-labeled TMDB regional certification > Jikan/MAL rating >
 *   AniList isAdult guard.
 * - Never present an inferred MAL/Jikan mapping as an official Irish
 *   classification.
 * - Never fabricate a numeric minimum when the source does not justify one.
 */

export type AgeGuideSource = "tmdb-ie" | "tmdb-other" | "mal" | "anilist" | "unknown";

export type AgeGuideConfidence = "verified" | "derived" | "limited";

export interface AgeGuide {
  /** Numeric minimum age; only set when the source justifies it. */
  minimumAge?: number;
  /** Compact display label, e.g. "13+", "17+", "All ages". */
  label: string;
  source: AgeGuideSource;
  /** Human-readable origin, e.g. "TMDB (US certification)" or "MyAnimeList rating". */
  sourceLabel?: string;
  confidence: AgeGuideConfidence;
}
