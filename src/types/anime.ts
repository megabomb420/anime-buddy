/**
 * Canonical anime/character domain model.
 *
 * AniList is the canonical anime identity whenever possible. MAL and TMDB
 * ids are stored as mappings when known. Community scores are kept SEPARATE
 * (AniList vs MAL) and never merged into a fake universal score.
 *
 * AI must never invent factual anime metadata — everything here comes from
 * AniList / Jikan / TMDB via the catalog providers.
 */

import type { AgeGuide } from "./age";

/** Explicit Crunchyroll availability states. Only `verified` is confirmed. */
export type AvailabilityState = "verified" | "candidate" | "unverified" | "unavailable";

export type AvailabilitySignalSource =
  | "anilist-streaming"
  | "anilist-external-link"
  | "tmdb-provider";

export interface CrunchyrollAvailability {
  /** AniList anime id. */
  animeId: number;
  /** ISO region code, e.g. "IE". */
  region: string;
  state: AvailabilityState;
  /** Which signals contributed to this state. */
  signals: AvailabilitySignalSource[];
  /** TMDB watch-provider id when matched (Crunchyroll = 283). */
  tmdbProviderId?: number;
  checkedAt: number;
  note?: string;
}

export interface Studio {
  name: string;
}

export interface AnimeRelation {
  anilistId: number;
  relationType: string;
  title: AnimeTitle;
  coverImage?: string;
  format?: string;
  status?: string;
}

export interface AnimeTitle {
  romaji: string;
  english?: string;
  native?: string;
}

export interface ExternalLink {
  site: string;
  url: string;
}

export interface AnimeSummary {
  /** Canonical identity: AniList id. */
  anilistId: number;
  malId?: number;
  tmdbId?: number;
  title: AnimeTitle;
  coverImage?: string;
  bannerImage?: string;
  /** TV, MOVIE, OVA, ... (AniList format enum as string). */
  format?: string;
  /** RELEASING, FINISHED, ... */
  status?: string;
  season?: string;
  seasonYear?: number;
  episodes?: number;
  genres: string[];
  tags: string[];
  synopsis?: string;
  /** AniList community score, 0–100. Display clearly as "AniList". */
  anilistScore?: number;
  /** MAL community score, 0–10. Fetched lazily via Jikan and cached. */
  malScore?: number;
  /** MAL content rating string as reported by Jikan, e.g. "PG-13". */
  malRating?: string;
  /** Strong 18+ guard from AniList. */
  isAdult: boolean;
  streamingLinks: ExternalLink[];
  externalLinks: ExternalLink[];
  ageGuide?: AgeGuide;
  availability?: CrunchyrollAvailability;
  studios?: string[];
  relations?: AnimeRelation[];
  /** Epoch ms when this record was cached locally. */
  cachedAt: number;
}

export interface CharacterSummary {
  /** AniList character id. */
  id: number;
  name: string;
  nameNative?: string;
  image?: string;
  /** AniList ids of anime this character appears in (as known). */
  animeIds: number[];
  description?: string;
  favorites?: number;
  cachedAt: number;
}
