/**
 * Deterministic "For you" scoring. AniList supplies titles; this only ranks.
 * Never invents ids or names.
 */

import type { AnimeSummary } from "../types/anime.ts";
import type { LibraryStatus } from "../types/entities.ts";

export interface TasteAnchor {
  anilistId: number;
  title?: string;
  genres: string[];
  tags?: string[];
  rating?: number;
  status?: LibraryStatus;
  favorite?: boolean;
}

export interface SeedBoost {
  score: number;
  because: string;
}

export interface ForYouOpts {
  weights: Map<string, number>;
  exclude: Set<number>;
  seedBoost: Map<number, SeedBoost>;
}

/** Same mapping as TasteService.learnFromRating: 1–10 → roughly -1..1 around 5.5. */
export function ratingToWeight(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, (score - 5.5) / 4.5));
}

function add(weights: Map<string, number>, labels: string[], amount: number): void {
  if (!amount) return;
  for (const raw of labels) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    weights.set(key, (weights.get(key) ?? 0) + amount);
  }
}

export function buildTasteWeights(anchors: TasteAnchor[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const a of anchors) {
    const labels = [...a.genres, ...(a.tags ?? []).slice(0, 8)];
    let w = 0;
    if (a.rating != null) w += ratingToWeight(a.rating);
    if (a.status === "completed" || a.status === "watching") w += 0.25;
    if (a.status === "dropped") w -= 0.55;
    if (a.status === "on_hold") w += 0.05;
    if (a.favorite) w += 0.35;
    add(weights, labels, w);
  }
  return weights;
}

export function topGenres(weights: Map<string, number>, n = 3): string[] {
  return [...weights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g);
}

function tasteHits(anime: AnimeSummary, weights: Map<string, number>): { sum: number; hits: number; names: string[] } {
  let sum = 0;
  let hits = 0;
  const names: string[] = [];
  for (const g of [...anime.genres, ...anime.tags.slice(0, 8)]) {
    const w = weights.get(g.toLowerCase());
    if (w == null || w === 0) continue;
    sum += w;
    hits += 1;
    if (w > 0.2 && names.length < 2 && anime.genres.some((x) => x.toLowerCase() === g.toLowerCase())) {
      names.push(g);
    }
  }
  return { sum, hits, names };
}

export function scoreForYou(anime: AnimeSummary, opts: ForYouOpts): number | null {
  if (opts.exclude.has(anime.anilistId)) return null;
  const { sum, hits } = tasteHits(anime, opts.weights);
  const taste = hits > 0 ? Math.tanh(sum) : 0;
  const quality = anime.anilistScore != null ? (anime.anilistScore - 55) / 45 : 0;
  const seed = opts.seedBoost.get(anime.anilistId)?.score ?? 0;
  return taste * 0.55 + quality * 0.2 + seed * 0.35;
}

export function reasonForYou(anime: AnimeSummary, opts: Pick<ForYouOpts, "weights" | "seedBoost">): string {
  const seed = opts.seedBoost.get(anime.anilistId);
  if (seed?.because) return `Because you liked ${seed.because}`;
  const { names } = tasteHits(anime, opts.weights);
  if (names.length) return `Matches your ${names.join(" · ")}`;
  return "From the catalog, ranked to your ratings";
}

export function pickForYou(pool: AnimeSummary[], opts: ForYouOpts, limit = 12): AnimeSummary[] {
  const scored = pool
    .map((anime) => {
      const score = scoreForYou(anime, opts);
      return score == null ? null : { anime, score };
    })
    .filter((row): row is { anime: AnimeSummary; score: number } => row != null)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<number>();
  const out: AnimeSummary[] = [];
  for (const row of scored) {
    if (seen.has(row.anime.anilistId)) continue;
    seen.add(row.anime.anilistId);
    out.push(row.anime);
    if (out.length >= limit) break;
  }
  return out;
}
