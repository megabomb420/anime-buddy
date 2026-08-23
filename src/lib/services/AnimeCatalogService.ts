/**
 * AnimeCatalogService — composes the catalog providers into one application
 *-facing API and owns caching. The catalog layer is independent from AI:
 * everything here is deterministic.
 *
 * Responsibilities:
 *   - search/get anime via AniList (canonical identity)
 *   - persist id mappings (AniList ↔ MAL ↔ TMDB)
 *   - lazily fetch + cache MAL extras (score, rating)
 *   - resolve + cache age guides (TMDB > MAL > AniList guard)
 *   - resolve + cache Crunchyroll availability
 */

import { resolveAgeGuide } from "@/lib/age/normalize";
import { resolveAvailability } from "@/lib/availability/resolve";
import { persistence } from "@/lib/db/persistence";
import { providers } from "@/lib/providers";
import type { AnimeSummary } from "@/types/anime";

/** How long cached MAL extras / availability stay fresh. */
const MAL_EXTRAS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AVAILABILITY_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export class AnimeCatalogService {
  async search(query: string, limit = 20): Promise<AnimeSummary[]> {
    const results = await providers.catalog.searchAnime(query, limit);
    // Cache in the background; search latency shouldn't wait for IDB.
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  /** Get anime by AniList id — cache-first, then AniList. */
  async getAnime(anilistId: number): Promise<AnimeSummary | null> {
    const cached = await persistence.getCachedAnime(anilistId);
    if (cached) return cached;
    const fresh = await providers.catalog.getAnime(anilistId);
    if (fresh) await persistence.cacheAnime(fresh);
    return fresh;
  }

  async getTrending(limit = 20): Promise<AnimeSummary[]> {
    const anilist = providers.catalog as unknown as {
      getTrending(limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getTrending(limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  async getPopular(limit = 20): Promise<AnimeSummary[]> {
    const anilist = providers.catalog as unknown as {
      getPopular(limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getPopular(limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  async getSeasonal(season: string, year: number, limit = 20): Promise<AnimeSummary[]> {
    const anilist = providers.catalog as unknown as {
      getSeasonal(season: string, year: number, limit?: number): Promise<AnimeSummary[]>;
    };
    const results = await anilist.getSeasonal(season, year, limit);
    void Promise.all(results.map((r) => persistence.cacheAnime(r)));
    return results;
  }

  /**
   * Enrich an anime with lazily-fetched MAL extras (score + rating).
   * Cached for MAL_EXTRAS_TTL_MS; never blocks the main render path.
   */
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
      return anime; // Jikan failure must never break the UI
    }
  }

  /**
   * Resolve the age guide for an anime following the priority:
   * TMDB (region) > TMDB (other, labeled) > MAL rating > AniList adult guard.
   */
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
        // Worker/TMDB unavailable — fall through to MAL/AniList sources.
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

  /**
   * Resolve Crunchyroll availability for a region from AniList signals +
   * TMDB watch providers. Never asks the AI; never scrapes Crunchyroll.
   */
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
        tmdbDataAvailable = false; // Worker not configured/reachable
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
