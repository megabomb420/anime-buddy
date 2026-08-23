/**
 * Age-guide normalization and resolution. Pure deterministic TypeScript —
 * AI is never involved in age data.
 *
 * Resolution priority (product spec):
 *   1. TMDB content certification for the selected region (default IE).
 *   2. Another regional TMDB certification — only with its country/source
 *      clearly identified.
 *   3. Jikan/MyAnimeList `rating` as fallback (mapped, marked derived).
 *   4. AniList `isAdult` as an additional adult-content guard only.
 *
 * Never present an inferred MAL/Jikan mapping as an official Irish
 * classification, and never fabricate a numeric minimum the source does
 * not justify.
 */

import type { AgeGuide } from "@/types/age";

/** MAL/Jikan `rating` strings → normalized AgeGuide. */
export function normalizeMalRating(rating: string | null | undefined): AgeGuide | undefined {
  if (!rating) return undefined;
  const r = rating.toLowerCase();

  if (r.startsWith("g")) {
    return { minimumAge: 0, label: "All ages", source: "mal", sourceLabel: "MyAnimeList rating (G)", confidence: "derived" };
  }
  if (r.startsWith("pg-13") || r.includes("pg-13")) {
    return { minimumAge: 13, label: "13+", source: "mal", sourceLabel: "MyAnimeList rating (PG-13)", confidence: "derived" };
  }
  if (r.startsWith("pg")) {
    return { label: "Children", source: "mal", sourceLabel: "MyAnimeList rating (PG)", confidence: "derived" };
  }
  if (r.startsWith("rx")) {
    return { minimumAge: 18, label: "18+", source: "mal", sourceLabel: "MyAnimeList rating (Rx — explicit)", confidence: "derived" };
  }
  if (r.startsWith("r+")) {
    // Mature / approximately 17+ — explicitly marked derived.
    return { minimumAge: 17, label: "~17+", source: "mal", sourceLabel: "MyAnimeList rating (R+, derived)", confidence: "derived" };
  }
  if (r.startsWith("r")) {
    return { minimumAge: 17, label: "17+", source: "mal", sourceLabel: "MyAnimeList rating (R / R-17)", confidence: "derived" };
  }
  return undefined;
}

/**
 * TMDB certification for a region, e.g. "12", "15", "18", "PG", "TV-MA".
 * `isSelectedRegion` = certification is for the user's region (default IE).
 */
export function fromTmdbCertification(
  certification: string,
  country: string,
  isSelectedRegion: boolean,
): AgeGuide | undefined {
  const cert = certification.trim();
  if (!cert) return undefined;

  const numeric = /^(\d{1,2})\+?$/.exec(cert);
  const source = isSelectedRegion ? ("tmdb-ie" as const) : ("tmdb-other" as const);
  const sourceLabel = isSelectedRegion
    ? `TMDB ${country} certification`
    : `TMDB certification (${country})`;

  if (numeric) {
    const age = Number(numeric[1]);
    return {
      minimumAge: age,
      label: `${age}+`,
      source,
      sourceLabel,
      confidence: isSelectedRegion ? "verified" : "limited",
    };
  }

  // Non-numeric national ratings — map conservatively, no invented numbers.
  const upper = cert.toUpperCase();
  const label =
    upper === "G" || upper === "U" || upper === "TV-Y"
      ? "All ages"
      : upper === "PG" || upper === "TV-PG"
        ? "Parental guidance"
        : upper === "TV-14"
          ? "14+"
          : upper === "TV-MA" || upper === "R" || upper === "NC-17"
            ? "18+"
            : cert;
  const mapped = /^\d{1,2}\+$/.test(label) ? { minimumAge: parseInt(label, 10) } : {};
  return {
    ...mapped,
    label,
    source,
    sourceLabel,
    confidence: isSelectedRegion ? "verified" : "limited",
  };
}

/** AniList `isAdult=true` — a strong 18+ guard signal, not a classification. */
export function fromAnilistIsAdult(isAdult: boolean): AgeGuide | undefined {
  if (!isAdult) return undefined;
  return {
    minimumAge: 18,
    label: "18+",
    source: "anilist",
    sourceLabel: "AniList adult flag",
    confidence: "limited",
  };
}

export interface ResolveAgeGuideInput {
  /** TMDB certification for the selected region, if any. */
  tmdbSelected?: { certification: string; country: string };
  /** TMDB certifications for other regions. */
  tmdbOthers?: Array<{ certification: string; country: string }>;
  /** Jikan/MAL rating string. */
  malRating?: string;
  /** AniList isAdult flag. */
  isAdult?: boolean;
}

/**
 * Resolve the best available AgeGuide following the priority order.
 * The AniList adult guard can only RAISE the result (e.g. 18+ guard wins
 * over a weaker derived mapping).
 */
export function resolveAgeGuide(input: ResolveAgeGuideInput): AgeGuide | undefined {
  let best: AgeGuide | undefined;

  if (input.tmdbSelected) {
    best = fromTmdbCertification(input.tmdbSelected.certification, input.tmdbSelected.country, true);
  }
  if (!best && input.tmdbOthers) {
    for (const other of input.tmdbOthers) {
      best = fromTmdbCertification(other.certification, other.country, false);
      if (best) break;
    }
  }
  if (!best) {
    best = normalizeMalRating(input.malRating);
  }

  const adultGuard = fromAnilistIsAdult(input.isAdult ?? false);
  if (adultGuard && (!best || (best.minimumAge ?? 0) < 18)) {
    best = adultGuard;
  }

  return best;
}

/** Whether an anime passes the current content-visibility settings. */
export function passesContentPolicy(
  guide: AgeGuide | undefined,
  isAdult: boolean,
  policy: { contentVisibility: "show_all" | "hide_18_plus" | "family"; maxAge?: number },
): boolean {
  if (policy.contentVisibility === "show_all") return true;
  if (policy.contentVisibility === "hide_18_plus") {
    if (isAdult) return false;
    return (guide?.minimumAge ?? 0) < 18;
  }
  // family
  if (isAdult) return false;
  const max = policy.maxAge ?? 12;
  if (!guide || guide.minimumAge === undefined) return true; // unknown ≠ blocked
  return guide.minimumAge <= max;
}
