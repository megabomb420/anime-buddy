/**
 * AnimeCatalogService — composes the catalog providers into one application
 * facing API and owns caching. The catalog layer is independent from AI:
 * everything here is deterministic.
 */

import { resolveAgeGuide } from "@/lib/age/normalize";
import { resolveAvailability } from "@/lib/availability/resolve";
import {
  rankByTitleMatch,
  searchQueryVariants,
  scoreTitleMatch,
} from "@/lib/catalog-search";
import { persistence } from "@/lib/db/persistence";
import { providers } from "@/lib/providers";
import type { AnimeSummary, CharacterSummary } from "@/types/anime";

const MAL_EXTRAS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AVAILABILITY_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 1000;
const searchMemo = new Map<string, { at: number; items: AnimeSummary[] }>();

const listMemo = new Map<string, { at: number; items: AnimeSummary[] }>();
const LIST_TTL_MS = 5 * 60 * 1000;

function remember(key: string, items: AnimeSummary[]): AnimeSummary[] {
  listMemo.set(key, { at: Date.now(), items });
  return items;
}

function recall(key: string): AnimeSummary[] | null {
  const hit = listMemo.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.items;
  return null;
}

function uniqueById(list: AnimeSummary[]): AnimeSummary[] {
  const seen = new Set<number>();
  const out: AnimeSummary[] = [];
  for (const a of list) {
    if (seen.has(a.anilistId)) continue;
    seen.add(a.anilistId);
    out.push(a);
  }
  return out;
}

export class AnimeCatalogService {
  async search(query: string, limit = 20): Promise<AnimeSummary[]> {
    const key = `${query.trim().toLowerCase()}:${limit}`;
    const hit = searchMemo.get(key);
    if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.items;

    const variants = searchQueryVariants(query);
    const batches = await Promise.all(
      variants.slice(0, 4).map((v) =>
        providers.catalog.searchAnime(v, Math.max(limit, 12)).catch(() => [] as AnimeSummary[]),
      ),
    );
    let merged = uniqueById(batches.flat());
    merged = rankByTitleMatch(query, merged);

    // Prefer real matches; if AniList returned noise, still keep ranked list.
    const strong = merged.filter((a) => scoreTitleMatch(query, a) >= 50);
    const results = (strong.length > 0 ? strong : merged).slice(0, limit);

    searchMemo.set(key, { at: Date.now(), items: results });
    if (searchMemo.size > 40) {
      const oldest = searchMemo.keys().next().value;
      if (oldest) searchMemo.delete(oldest);
    }
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  async getAnime(anilistId: number): Promise<AnimeSummary | null> {
    const cached = await persistence.getCachedAnime(anilistId);
    if (cached) return cached;
    const fresh = await providers.catalog.getAnime(anilistId);
    if (fresh) await persistence.cacheAnime(fresh);
    return fresh;
  }

  async getTrending(limit = 20): Promise<AnimeSummary[]> {
    const key = `trending:${limit}`;
    const cached = recall(key);
    if (cached) return cached;
    const anilist = providers.catalog as unknown as {
      getTrending(limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getTrending(limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return remember(key, results);
  }

  async getPopular(limit = 20): Promise<AnimeSummary[]> {
    const key = `popular:${limit}`;
    const cached = recall(key);
    if (cached) return cached;
    const anilist = providers.catalog as unknown as {
      getPopular(limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getPopular(limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return remember(key, results);
  }

  async getSeasonal(season: string, year: number, limit = 20): Promise<AnimeSummary[]> {
    const anilist = providers.catalog as unknown as {
      getSeasonal(season: string, year: number, limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getSeasonal(season, year, limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  async searchCharacters(query: string, limit = 8): Promise<CharacterSummary[]> {
    const results = await providers.catalog.searchCharacters(query, limit);
    void Promise.all(results.map((c) => persistence.cacheCharacter(c)));
    return results;
  }

  async getCharacter(characterId: number): Promise<CharacterSummary | null> {
    const cached = await persistence.getCharacter(characterId);
    if (cached) return cached;
    const fresh = await providers.catalog.getCharacter(characterId);
    if (fresh) await persistence.cacheCharacter(fresh);
    return fresh;
  }

  async enrichWithMalExtras(anime: AnimeSummary): Promise<AnimeSummary> {
    if (!anime.malId) return anime;
    const cached = await persistence.getCachedAnime(anime.anilistId);
    if (
      cached &&
      (cached.malScore !== undefined || cached.malRating !== undefined) &&
      Date.now() - cached.cachedAt < MAL_EXTRAS_TTL_MS
    ) {
      return { ...anime, malScore: cached.malScore, malRating: cached.malRating };
    }
    try {
      const extras = await providers.malExtras.getMalExtras(anime.malId);
      const merged: AnimeSummary = {
        ...anime,
        malScore: extras.score ?? anime.malScore,
        malRating: extras.rating ?? anime.malRating,
      };
      await persistence.cacheAnime(merged);
      return merged;
    } catch {
      return anime;
    }
  }

  async resolveAgeGuideFor(anime: AnimeSummary, region: string): Promise<AnimeSummary> {
    const cached = await persistence.getAgeGuide(anime.anilistId, region);
    if (cached) return { ...anime, ageGuide: cached.guide };

    let tmdbSelected: { certification: string; country: string } | undefined;
    let tmdbOthers: Array<{ certification: string; country: string }> = [];

    if (anime.tmdbId) {
      try {
        const certs = await providers.tmdb.getContentCertifications(anime.tmdbId);
        tmdbSelected = certs.find((c) => c.country === region);
        tmdbOthers = certs.filter((c) => c.country !== region);
      } catch {
        /* fall through */
      }
    }

    const guide = resolveAgeGuide({
      tmdbSelected,
      tmdbOthers,
      malRating: anime.malRating,
      isAdult: anime.isAdult,
    });

    if (guide) {
      await persistence.saveAgeGuide({
        id: `${anime.anilistId}:${region}`,
        anilistId: anime.anilistId,
        region,
        guide,
        updatedAt: Date.now(),
      });
    }
    return { ...anime, ageGuide: guide };
  }

  async resolveAvailabilityFor(anime: AnimeSummary, region: string): Promise<AnimeSummary> {
    const cached = await persistence.getAvailability(anime.anilistId, region);
    if (cached && Date.now() - cached.checkedAt < AVAILABILITY_TTL_MS) {
      return { ...anime, availability: cached };
    }

    let tmdbProviderIds: number[] | undefined;
    let tmdbDataAvailable: boolean | undefined;

    let tmdbId = anime.tmdbId;
    if (!tmdbId) {
      try {
        tmdbId =
          (await providers.tmdb.findTmdbId({
            title: anime.title.english ?? anime.title.romaji,
            year: anime.seasonYear,
          })) ?? undefined;
        if (tmdbId) {
          await persistence.saveIdMapping({
            anilistId: anime.anilistId,
            malId: anime.malId,
            tmdbId,
            source: "tmdb",
            updatedAt: Date.now(),
          });
        }
      } catch {
        tmdbDataAvailable = false;
      }
    }

    if (tmdbId) {
      try {
        tmdbProviderIds = (await providers.tmdb.getWatchProviderIds(tmdbId, region)) ?? undefined;
        tmdbDataAvailable = tmdbProviderIds !== undefined;
      } catch {
        tmdbDataAvailable = false;
      }
    }

    const availability = resolveAvailability({
      anilistId: anime.anilistId,
      region,
      streamingLinks: anime.streamingLinks,
      externalLinks: anime.externalLinks,
      tmdbProviderIds,
      tmdbDataAvailable,
    });

    await persistence.saveAvailability({ ...availability, id: `${anime.anilistId}:${region}` });
    return { ...anime, tmdbId, availability };
  }
}

export const animeCatalogService = new AnimeCatalogService();
