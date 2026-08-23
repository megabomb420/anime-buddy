/**
 * Jikan (MyAnimeList) provider — SECONDARY source.
 *
 * Used ONLY for:
 *   - MAL community score (fetched lazily, cached)
 *   - MAL content rating string (age-guide fallback)
 *
 * https://docs.api.jikan.moe
 * Jikan is rate-limited (~3 req/s); the service layer caches aggressively.
 */

import type { MalExtrasProvider } from "./types";

const JIKAN_URL = "https://api.jikan.moe/v4";

export class JikanProvider implements MalExtrasProvider {
  readonly name = "jikan";

  async getMalExtras(malId: number): Promise<{ score?: number; rating?: string }> {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}`, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { score?: number | null; rating?: string | null };
    };
    return {
      score: json.data?.score ?? undefined,
      rating: json.data?.rating ?? undefined,
    };
  }
}
