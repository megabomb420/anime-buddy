/**
 * Catalog provider contracts.
 *
 * The catalog layer is INDEPENDENT from AI. Providers fetch factual
 * metadata from their respective APIs; services compose them.
 */

import type { AnimeSummary, CharacterSummary } from "@/types/anime";

/** Primary metadata source (AniList). */
export interface CatalogProvider {
  readonly name: string;
  searchAnime(query: string, limit?: number): Promise<AnimeSummary[]>;
  getAnime(anilistId: number): Promise<AnimeSummary | null>;
  getCharacters(anilistId: number): Promise<CharacterSummary[]>;
  getCharacter(characterId: number): Promise<CharacterSummary | null>;
  searchCharacters(query: string, limit?: number): Promise<CharacterSummary[]>;
}

/** Secondary source for MAL community score + MAL content rating (Jikan). */
export interface MalExtrasProvider {
  readonly name: string;
  getMalExtras(malId: number): Promise<{ score?: number; rating?: string }>;
}

/** Regional watch-provider + content-certification source (TMDB, via Worker). */
export interface TmdbProvider {
  readonly name: string;
  /** Resolve a TMDB tv/movie id from an external id when possible. */
  findTmdbId(imdbOrTitle: { title: string; year?: number }): Promise<number | null>;
  /** Flatrate provider ids available in `region` for a TMDB id. */
  getWatchProviderIds(tmdbId: number, region: string): Promise<number[] | null>;
  /** Content certifications grouped by country. */
  getContentCertifications(
    tmdbId: number,
  ): Promise<Array<{ country: string; certification: string }>>;
}
