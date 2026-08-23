/**
 * RecommendationService — the recommendation pipeline.
 *
 *   user request
 *   → extract hard constraints
 *   → Crunchyroll filter
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
import { persistence } from "@/lib/db/persistence";
import { providers } from "@/lib/providers";
import type { HardConstraints } from "@/types/ai";
import type { AnimeSummary } from "@/types/anime";
import type { RecommendationItem, RecommendationRecord } from "@/types/entities";
import { animeCatalogService } from "./AnimeCatalogService";

export interface RecommendOptions {
  query: string;
  context: string;
  /** Skip the AI rerank step (offline / no Worker). */
  localOnly?: boolean;
  region?: string;
  candidateLimit?: number;
}

export class RecommendationService {
  /**
   * Build hard constraints from settings + library. Natural-language
   * constraint extraction from `query` is a later AI-assisted step; v1
   * derives constraints deterministically.
   */
  private async buildHardConstraints(region: string): Promise<HardConstraints> {
    const settings = await persistence.getSettings();
    const library = await persistence.getLibrary();
    return {
      maxAge: settings.contentVisibility === "family" ? (settings.maxAge ?? 12) : undefined,
      excludeAnilistIds: library.map((e) => e.anilistId),
      mustBeOnCrunchyroll: true,
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

  async recommend(options: RecommendOptions): Promise<RecommendationRecord> {
    const settings = await persistence.getSettings();
    const region = options.region ?? settings.region;
    const hard = await this.buildHardConstraints(region);

    // 1. Candidate sourcing — search AniList by the request text. Broader
    //    discovery modes (Tonight, Hidden Gem, Season Radar) will add their
    //    own deterministic sources later.
    const rawCandidates = await animeCatalogService.search(
      options.query,
      options.candidateLimit ?? 30,
    );

    // 2–4. Deterministic filters: library exclusions, age/family, then
    //      Crunchyroll availability for survivors.
    const excluded = new Set(hard.excludeAnilistIds ?? []);
    let candidates = rawCandidates.filter((c) => !excluded.has(c.anilistId));

    candidates = candidates.filter((c) =>
      passesContentPolicy(c.ageGuide, c.isAdult, {
        contentVisibility: settings.contentVisibility,
        maxAge: settings.maxAge,
      }),
    );

    const withAvailability = await Promise.all(
      candidates.map((c) => animeCatalogService.resolveAvailabilityFor(c, region)),
    );

    // Only confirmed Crunchyroll titles are recommendable. If nothing is
    // verified, surface candidates honestly instead of hallucinating.
    let pool = withAvailability.filter((c) => isConfirmedOnCrunchyroll(c.availability));
    const fellBackToCandidates = pool.length === 0;
    if (fellBackToCandidates) {
      pool = withAvailability.filter((c) => c.availability?.state === "candidate");
    }
    pool = pool.slice(0, 30);

    // 5–7. Local taste scoring (character-preference scoring plugs in here
    //      once Character DNA is populated).
    const scored = await Promise.all(
      pool.map(async (c) => ({ anime: c, score: await this.localTasteScore(c) })),
    );
    scored.sort((a, b) => b.score - a.score);
    const localPool = scored.map((s) => s.anime);

    // 8. AI semantic reranking (optional).
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
        // 9. Validate IDs: only accept ids that exist in our pool — the
        //    model can never invent titles.
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

    // 10. Persist + return.
    const reasonSuffix = fellBackToCandidates
      ? " (Crunchyroll availability unconfirmed — shown as candidate)"
      : "";
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

  /** Record feedback on a recommendation — feeds back into taste signals. */
  async recordFeedback(
    anilistId: number,
    feedback: "like" | "dislike" | "already_seen" | "not_for_me",
    recommendationId?: string,
  ): Promise<void> {
    await persistence.addRecommendationFeedback({ anilistId, feedback, recommendationId });
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
