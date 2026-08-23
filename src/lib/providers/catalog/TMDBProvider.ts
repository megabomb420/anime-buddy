/**
 * TMDB provider — regional watch-provider verification and regional content
 * ratings. The TMDB API key is a Worker secret, so ALL TMDB traffic goes
 * through the Cloudflare Worker (`/api/tmdb/*` passthrough).
 */

import { config } from "@/lib/config";
import type { TmdbProvider } from "./types";

interface TmdbSearchResponse {
  results?: Array<{ id: number; first_air_date?: string; release_date?: string }>;
}

interface TmdbWatchProvidersResponse {
  results?: Record<string, { flatrate?: Array<{ provider_id: number }>; ads?: Array<{ provider_id: number }> }>;
}

interface TmdbContentRatingsResponse {
  results?: Array<{ iso_3166_1: string; rating: string }>;
}

export class TMDBProvider implements TmdbProvider {
  readonly name = "tmdb";

  private get base(): string {
    if (!config.workerUrl) {
      throw new Error("VITE_WORKER_URL is not configured — TMDB requires the Cloudflare Worker");
    }
    return `${config.workerUrl.replace(/\/$/, "")}/api/tmdb`;
  }

  async findTmdbId(query: { title: string; year?: number }): Promise<number | null> {
    const params = new URLSearchParams({ query: query.title });
    if (query.year) params.set("first_air_date_year", String(query.year));
    const res = await fetch(`${this.base}/search/tv?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as TmdbSearchResponse;
    return json.results?.[0]?.id ?? null;
  }

  /** Returns null when TMDB has no provider data (≠ "unavailable"). */
  async getWatchProviderIds(tmdbId: number, region: string): Promise<number[] | null> {
    const res = await fetch(`${this.base}/tv/${tmdbId}/watch/providers`);
    if (!res.ok) return null;
    const json = (await res.json()) as TmdbWatchProvidersResponse;
    const entry = json.results?.[region];
    if (!entry) return null;
    return [
      ...(entry.flatrate ?? []).map((p) => p.provider_id),
      ...(entry.ads ?? []).map((p) => p.provider_id),
    ];
  }

  async getContentCertifications(
    tmdbId: number,
  ): Promise<Array<{ country: string; certification: string }>> {
    const res = await fetch(`${this.base}/tv/${tmdbId}/content_ratings`);
    if (!res.ok) return [];
    const json = (await res.json()) as TmdbContentRatingsResponse;
    return (json.results ?? [])
      .filter((r) => r.rating)
      .map((r) => ({ country: r.iso_3166_1, certification: r.rating }));
  }
}
