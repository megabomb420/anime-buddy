/**
 * RecommendationService — the recommendation pipeline.
 *
 *   user request
 *   → extract hard constraints
 *   → Crunchyroll filter (optional)
 *   → age/family constraints
 *   → library exclusions
 *   → local taste scoring
 *   → character preference scoring
 *   → candidate pool (~10–30)
 *   → DeepSeek semantic reranking (optional; AIProvider)
 *   → validate IDs
 *   → top 3 recommendations
 *
 * Everything except the AI rerank step is deterministic TypeScript.
 * The complete anime database is NEVER sent to the model.
 */

import { passesContentPolicy } from "@/lib/age/normalize";
import { isConfirmedOnCrunchyroll } from "@/lib/availability/resolve";
import { isVagueCatalogQuery } from "@/lib/buddy-intent";
import { persistence } from "@/lib/db/persistence";
import { fitsTimeBudget } from "@/lib/time-budget";
import { animeTitle } from "@/lib/media";
import { providers } from "@/lib/providers";
import {
  buildTasteWeights,
  pickForYou,
  reasonForYou,
  topGenres,
  type SeedBoost,
  type TasteAnchor,
} from "@/lib/taste-rank";
import type { HardConstraints } from "@/types/ai";
import type { AnimeSummary } from "@/types/anime";
import type { RecommendationItem, RecommendationRecord } from "@/types/entities";
import { animeCatalogService } from "./AnimeCatalogService";

export interface ForYouResult {
  items: AnimeSummary[];
  kicker: string;
  /** Per-item human reason, keyed by AniList id. From AniList data only. */
  reasons: Record<number, string>;
  empty?: "no-taste" | "no-matches";
}

export interface ForYouOptions {
  /** Extra ids to keep out of the row (Refresh / "not for me"). */
  excludeIds?: Set<number>;
}

export interface RecommendOptions {
  query: string;
  context: string;
  /** Skip the AI rerank step (offline / no Worker). */
  localOnly?: boolean;
  region?: string;
  candidateLimit?: number;
  /** Home recs stay Crunchyroll-first. Ren chat recs skip this so covers always show. */
  requireCrunchyroll?: boolean;
  /** Hard "finishable in N minutes" filter (Tonight). 9999+ = no limit. */
  timeBudgetMinutes?: number;
}

function currentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 2) return { season: "WINTER", year };
  if (month <= 5) return { season: "SPRING", year };
  if (month <= 8) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

function uniqueAnime(list: AnimeSummary[]): AnimeSummary[] {
  const seen = new Set<number>();
  const out: AnimeSummary[] = [];
  for (const a of list) {
    if (seen.has(a.anilistId)) continue;
    seen.add(a.anilistId);
    out.push(a);
  }
  return out;
}

export class RecommendationService {
  /**
   * Build hard constraints from settings + library. Natural-language
   * constraint extraction from `query` is a later AI-assisted step; v1
   * derives constraints deterministically.
   */
  private async buildHardConstraints(region: string, requireCrunchyroll: boolean): Promise<HardConstraints> {
    const settings = await persistence.getSettings();
    const library = await persistence.getLibrary();
    const hidden = await persistence.getHiddenAnime().catch(() => []);
    return {
      maxAge: settings.contentVisibility === "family" ? (settings.maxAge ?? 12) : undefined,
      excludeAnilistIds: [
        ...library.map((e) => e.anilistId),
        ...hidden.map((h) => h.anilistId),
      ],
      mustBeOnCrunchyroll: requireCrunchyroll,
      region,
    };
  }

  /** Deterministic local taste score for one candidate. */
  private async localTasteScore(anime: AnimeSummary): Promise<number> {
    const signals = await persistence.getTasteSignals();
    if (signals.length === 0) return anime.anilistScore ? anime.anilistScore / 100 : 0.5;

    const genreWeights = new Map<string, number[]>();
    for (const s of signals) {
      if (s.kind !== "genre" && s.kind !== "tag" && s.kind !== "theme") continue;
      const list = genreWeights.get(s.value) ?? [];
      list.push(s.weight);
      genreWeights.set(s.value, list);
    }

    let score = 0;
    let hits = 0;
    for (const g of [...anime.genres, ...anime.tags]) {
      const weights = genreWeights.get(g.toLowerCase());
      if (weights) {
        score += weights.reduce((a, b) => a + b, 0) / weights.length;
        hits += 1;
      }
    }
    const tasteComponent = hits > 0 ? 0.5 + Math.tanh(score) / 2 : 0.5;
    const qualityComponent = anime.anilistScore ? anime.anilistScore / 100 : 0.5;
    return tasteComponent * 0.6 + qualityComponent * 0.4;
  }

  private async discoveryPool(limit: number): Promise<AnimeSummary[]> {
    const { season, year } = currentSeason();
    const [trending, popular, seasonal] = await Promise.all([
      animeCatalogService.getTrending(Math.max(12, Math.ceil(limit * 0.6))),
      animeCatalogService.getPopular(Math.max(12, Math.ceil(limit * 0.6))),
      animeCatalogService.getSeasonal(season, year, 16),
    ]);
    return uniqueAnime([...trending, ...seasonal, ...popular]).slice(0, Math.max(limit, 24));
  }

  private async sourceCandidates(query: string, context: string, limit: number): Promise<AnimeSummary[]> {
    const searchable =
      context === "similar" ||
      context.startsWith("mood-") ||
      context === "family" ||
      context === "because-you-like";

    if (searchable && query.trim()) {
      const hits = await animeCatalogService.search(query, limit);
      if (hits.length >= 6) return hits;
      const extra = await this.discoveryPool(limit);
      return uniqueAnime([...hits, ...extra]).slice(0, limit);
    }

    if (
      context === "tonight" ||
      context === "surprise" ||
      context === "chat-rec" ||
      isVagueCatalogQuery(query)
    ) {
      return this.discoveryPool(limit);
    }

    if (!query.trim()) return this.discoveryPool(limit);
    const hits = await animeCatalogService.search(query, limit);
    if (hits.length >= 4) return hits;
    return uniqueAnime([...hits, ...(await this.discoveryPool(limit))]).slice(0, limit);
  }

  async recommend(options: RecommendOptions): Promise<RecommendationRecord> {
    const settings = await persistence.getSettings();
    const region = options.region ?? settings.region;
    const requireCrunchyroll = options.requireCrunchyroll ?? true;
    const hard = await this.buildHardConstraints(region, requireCrunchyroll);

    const rawCandidates = await this.sourceCandidates(
      options.query,
      options.context,
      options.candidateLimit ?? 30,
    );

    const excluded = new Set(hard.excludeAnilistIds ?? []);
    let candidates = rawCandidates.filter((c) => !excluded.has(c.anilistId));

    candidates = candidates.filter((c) =>
      passesContentPolicy(c.ageGuide, c.isAdult, {
        contentVisibility: settings.contentVisibility,
        maxAge: settings.maxAge,
      }),
    );

    let usedBudgetFallback = false;
    const budget = options.timeBudgetMinutes;
    if (budget != null && budget < 9999) {
      const fits = candidates.filter((c) => fitsTimeBudget(c, budget));
      if (fits.length > 0) candidates = fits;
      else usedBudgetFallback = true;
    }

    let pool = candidates;
    let fellBackToCandidates = false;

    if (requireCrunchyroll) {
      const withAvailability = await Promise.all(
        candidates.map((c) => animeCatalogService.resolveAvailabilityFor(c, region)),
      );
      pool = withAvailability.filter((c) => isConfirmedOnCrunchyroll(c.availability));
      fellBackToCandidates = pool.length === 0;
      if (fellBackToCandidates) {
        pool = withAvailability.filter((c) => c.availability?.state === "candidate");
      }
    }

    pool = pool.slice(0, 30);

    const scored = await Promise.all(
      pool.map(async (c) => ({ anime: c, score: await this.localTasteScore(c) })),
    );
    scored.sort((a, b) => b.score - a.score);
    const localPool = scored.map((s) => s.anime);

    let items: RecommendationItem[];
    let source: RecommendationRecord["source"] = "local";

    if (!options.localOnly && localPool.length > 0) {
      try {
        const taste = await persistence.getTasteProfile();
        const ranked = await providers.ai.recommend({
          query: options.query,
          candidates: localPool,
          hardConstraints: hard,
          tasteSummary: taste.summary,
        });
        const validIds = new Set(localPool.map((c) => c.anilistId));
        const validated = ranked.filter((r) => validIds.has(r.anilistId));
        if (validated.length > 0) {
          items = validated.slice(0, 3);
          source = "ai";
        } else {
          items = this.localFallback(scored);
        }
      } catch {
        items = this.localFallback(scored);
      }
    } else {
      items = this.localFallback(scored);
    }

    let reasonSuffix = fellBackToCandidates
      ? " (Crunchyroll availability unconfirmed — shown as candidate)"
      : "";
    if (usedBudgetFallback) {
      reasonSuffix += " (nothing fits that time budget — shortest matches shown)";
    }
    if (reasonSuffix) {
      items = items.map((i) => ({ ...i, reason: i.reason + reasonSuffix }));
    }

    return persistence.saveRecommendation({ context: options.context, items, source });
  }

  private localFallback(
    scored: Array<{ anime: AnimeSummary; score: number }>,
  ): RecommendationItem[] {
    return scored.slice(0, 3).map((s) => ({
      anilistId: s.anime.anilistId,
      reason: `Matched your taste profile (local score ${s.score.toFixed(2)}).`,
      score: s.score,
    }));
  }

  /**
   * Home "For you" row. Seeds from ratings / library, candidates from AniList
   * (recommendations + genre lists + trending). No invented titles.
   */
  async forYou(limit = 12, opts?: ForYouOptions): Promise<ForYouResult> {
    const [library, ratings, favorites, settings, hidden] = await Promise.all([
      persistence.getLibrary(),
      persistence.getAnimeRatings(),
      persistence.getFavoriteAnime(),
      persistence.getSettings(),
      persistence.getHiddenAnime().catch(() => []),
    ]);

    const ratingMap = new Map(ratings.map((r) => [r.anilistId, r.score]));
    const favSet = new Set(favorites.map((f) => f.anilistId));
    const exclude = new Set(library.map((e) => e.anilistId));
    for (const h of hidden) exclude.add(h.anilistId);
    for (const id of opts?.excludeIds ?? []) exclude.add(id);

    const anchors: TasteAnchor[] = [];
    const seenAnchor = new Set<number>();

    const pushAnchor = async (anilistId: number, status?: TasteAnchor["status"]) => {
      if (seenAnchor.has(anilistId)) return;
      const cached =
        (await persistence.getCachedAnime(anilistId)) ??
        (await animeCatalogService.getAnime(anilistId));
      if (!cached) return;
      seenAnchor.add(anilistId);
      anchors.push({
        anilistId,
        title: animeTitle(cached),
        genres: cached.genres,
        tags: cached.tags,
        rating: ratingMap.get(anilistId),
        status,
        favorite: favSet.has(anilistId),
      });
    };

    for (const e of library) await pushAnchor(e.anilistId, e.status);
    for (const r of ratings) await pushAnchor(r.anilistId);
    for (const f of favorites) await pushAnchor(f.anilistId);

    const hasTaste = anchors.some(
      (a) => a.rating != null || a.status === "completed" || a.status === "watching" || a.favorite,
    );
    if (!hasTaste) {
      return { items: [], kicker: "From your library", reasons: {}, empty: "no-taste" };
    }

    const weights = buildTasteWeights(anchors);
    const genres = topGenres(weights, 3);
    const seeds = [...anchors]
      .filter((a) => (a.rating ?? 0) >= 7.5 || a.favorite || a.status === "completed")
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4);

    const seedBoost = new Map<number, SeedBoost>();
    const recPools = await Promise.all(
      seeds.map(async (seed) => {
        try {
          const recs = await animeCatalogService.getRecommended(seed.anilistId, 8);
          const because = seed.title ?? `title #${seed.anilistId}`;
          for (const rec of recs) {
            if (exclude.has(rec.anilistId)) continue;
            const prev = seedBoost.get(rec.anilistId);
            const next: SeedBoost = { score: Math.max(prev?.score ?? 0, 0.85), because: prev?.because ?? because };
            seedBoost.set(rec.anilistId, next);
          }
          return recs;
        } catch {
          return [] as AnimeSummary[];
        }
      }),
    );

    const genreLabel = (key: string) => {
      for (const a of anchors) {
        const hit = a.genres.find((g) => g.toLowerCase() === key);
        if (hit) return hit;
      }
      return key.charAt(0).toUpperCase() + key.slice(1);
    };

    const genrePools = await Promise.all(
      genres.map(async (g) => {
        try {
          return await animeCatalogService.getByGenre(genreLabel(g), 12);
        } catch {
          return [] as AnimeSummary[];
        }
      }),
    );

    let discovery: AnimeSummary[] = [];
    try {
      discovery = await this.discoveryPool(24);
    } catch {
      discovery = [];
    }

    const pool = uniqueAnime([...recPools.flat(), ...genrePools.flat(), ...discovery]);
    const filtered = pool.filter((c) =>
      passesContentPolicy(c.ageGuide, c.isAdult, {
        contentVisibility: settings.contentVisibility,
        maxAge: settings.maxAge,
      }),
    );

    const items = pickForYou(filtered, { weights, exclude, seedBoost }, limit);
    if (!items.length) {
      return { items: [], kicker: "From your ratings", reasons: {}, empty: "no-matches" };
    }

    const reasons: Record<number, string> = {};
    for (const anime of items) {
      reasons[anime.anilistId] = reasonForYou(anime, { weights, seedBoost });
    }

    const kicker = seeds[0]?.title ? `Because you liked ${seeds[0].title}` : "From your ratings";
    return { items, kicker, reasons };
  }

  /** Record feedback on a recommendation — feeds back into taste signals. */
  async recordFeedback(
    anilistId: number,
    feedback: "like" | "dislike" | "already_seen" | "not_for_me",
    recommendationId?: string,
  ): Promise<void> {
    await persistence.addRecommendationFeedback({ anilistId, feedback, recommendationId });
    if (feedback === "not_for_me") {
      // Permanent exclusion from every recommendation surface.
      await persistence.hideAnime(anilistId, "not_for_me");
    }
    const anime = await persistence.getCachedAnime(anilistId);
    if (anime && (feedback === "like" || feedback === "dislike")) {
      const weight = feedback === "like" ? 0.4 : -0.4;
      for (const genre of anime.genres) {
        await persistence.addTasteSignal({
          kind: "genre",
          value: genre.toLowerCase(),
          weight,
          source: "recommendation-feedback",
          subjectId: anilistId,
        });
      }
    }
  }
}

export const recommendationService = new RecommendationService();
