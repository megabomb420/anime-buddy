/**
 * Crunchyroll availability resolution. Pure deterministic TypeScript.
 *
 * Rules (product spec):
 * - NEVER ask the AI whether a title is on Crunchyroll.
 * - Signals: AniList streaming/external links + TMDB regional watch
 *   providers.
 * - Only `verified` is treated as confirmed availability.
 * - If verification is impossible, say so — never hallucinate.
 * - No brittle Crunchyroll scraping anywhere in the app.
 */

import type {
  AvailabilitySignalSource,
  AvailabilityState,
  CrunchyrollAvailability,
  ExternalLink,
} from "@/types/anime";

/** TMDB watch-provider id for Crunchyroll. */
export const TMDB_PROVIDER_CRUNCHYROLL = 283;

function linksMentionCrunchyroll(links: ExternalLink[]): boolean {
  return links.some(
    (l) =>
      /crunchyroll/i.test(l.site) ||
      /crunchyroll\.com/i.test(l.url) ||
      // AniList historically lists some Crunchyroll-hosted streams under
      // partner brands; keep the matcher conservative.
      /\bCR\b/.test(l.site),
  );
}

export interface ResolveAvailabilityInput {
  anilistId: number;
  region: string;
  streamingLinks: ExternalLink[];
  externalLinks: ExternalLink[];
  /** TMDB flatrate/ads provider ids for the region, if TMDB data exists. */
  tmdbProviderIds?: number[];
  /** False when TMDB has no watch-provider data for this title+region. */
  tmdbDataAvailable?: boolean;
}

export function resolveAvailability(input: ResolveAvailabilityInput): CrunchyrollAvailability {
  const signals: AvailabilitySignalSource[] = [];

  const anilistStreaming = linksMentionCrunchyroll(input.streamingLinks);
  const anilistExternal = linksMentionCrunchyroll(input.externalLinks);
  const tmdbHit = (input.tmdbProviderIds ?? []).includes(TMDB_PROVIDER_CRUNCHYROLL);

  if (anilistStreaming) signals.push("anilist-streaming");
  if (anilistExternal) signals.push("anilist-external-link");
  if (tmdbHit) signals.push("tmdb-provider");

  let state: AvailabilityState;
  let note: string | undefined;

  if (tmdbHit) {
    // TMDB regional provider data is the strongest signal.
    state = "verified";
  } else if (anilistStreaming) {
    // AniList lists a Crunchyroll streaming link but TMDB doesn't confirm.
    state = "candidate";
    note = "AniList lists Crunchyroll streaming; not confirmed by TMDB for this region.";
  } else if (anilistExternal) {
    state = "candidate";
    note = "AniList external link mentions Crunchyroll; unconfirmed for this region.";
  } else if (input.tmdbDataAvailable === false) {
    state = "unverified";
    note = "No availability data could be checked — verification impossible.";
  } else {
    state = "unavailable";
    note = "No Crunchyroll signal from AniList or TMDB for this region.";
  }

  return {
    animeId: input.anilistId,
    region: input.region,
    state,
    signals,
    tmdbProviderId: tmdbHit ? TMDB_PROVIDER_CRUNCHYROLL : undefined,
    checkedAt: Date.now(),
    note,
  };
}

/** Only `verified` is treated as confirmed Crunchyroll availability. */
export function isConfirmedOnCrunchyroll(a: CrunchyrollAvailability | undefined): boolean {
  return a?.state === "verified";
}
