/**
 * AniList public-list import — one-time, no account, no token.
 *
 * Fetches a user's PUBLIC anime list via the AniList GraphQL API, maps it to
 * local library entries + ratings, shows a preview, and only writes to
 * IndexedDB after the user confirms. Titles the app already has get updated
 * (AniList wins for imported ids).
 *
 * This module stays DB-free so it is unit-testable under plain `node --test`.
 * The write step lives in `anilist-import-apply.ts`.
 */

import type { AnimeSummary } from "@/types/anime";
import type { LibraryStatus } from "@/types/entities";

const ANILIST_URL = "https://graphql.anilist.co";
const MAX_CHUNKS = 10;

/** AniList MediaListStatus → local LibraryStatus. REPEATING = rewatching. */
export function mapAniListStatus(status: string): { status: LibraryStatus; rewatch: boolean } {
  switch (status.toUpperCase()) {
    case "CURRENT":
      return { status: "watching", rewatch: false };
    case "REPEATING":
      return { status: "watching", rewatch: true };
    case "PLANNING":
      return { status: "plan_to_watch", rewatch: false };
    case "COMPLETED":
      return { status: "completed", rewatch: false };
    case "DROPPED":
      return { status: "dropped", rewatch: false };
    case "PAUSED":
      return { status: "on_hold", rewatch: false };
    default:
      return { status: "plan_to_watch", rewatch: false };
  }
}

export interface AniListImportEntry {
  anilistId: number;
  status: LibraryStatus;
  progress: number;
  /** 1–10 whole points (AniList POINT_10), undefined when unrated. */
  score?: number;
  rewatch: boolean;
  anime: AnimeSummary;
}

export interface AniListImportPreview {
  username: string;
  entries: AniListImportEntry[];
  byStatus: Record<LibraryStatus, number>;
  rated: number;
}

interface RawMedia {
  id: number;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  coverImage?: { large?: string | null; extraLarge?: string | null } | null;
  episodes?: number | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  genres?: string[] | null;
  tags?: Array<{ name: string }> | null;
  averageScore?: number | null;
  isAdult?: boolean | null;
}

function toSummary(m: RawMedia): AnimeSummary {
  return {
    anilistId: m.id,
    title: {
      romaji: m.title?.romaji ?? `Anime #${m.id}`,
      english: m.title?.english ?? undefined,
      native: m.title?.native ?? undefined,
    },
    coverImage: m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined,
    episodes: m.episodes ?? undefined,
    format: m.format ?? undefined,
    status: m.status ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    genres: m.genres ?? [],
    tags: (m.tags ?? []).map((t) => t.name),
    anilistScore: m.averageScore ?? undefined,
    isAdult: m.isAdult ?? false,
    streamingLinks: [],
    externalLinks: [],
    cachedAt: Date.now(),
  };
}

const QUERY = `query ($name: String!, $chunk: Int) {
  MediaListCollection(userName: $name, type: ANIME, perChunk: 500, chunk: $chunk) {
    hasNextChunk
    lists {
      entries {
        status
        progress
        score(format: POINT_10)
        media {
          id
          title { romaji english native }
          coverImage { extraLarge large }
          episodes
          format
          status
          season
          seasonYear
          genres
          tags { name }
          averageScore
          isAdult
        }
      }
    }
  }
}`;

interface RawEntry {
  status: string;
  progress: number;
  score: number;
  media: RawMedia;
}

export async function fetchAniListList(username: string): Promise<AniListImportPreview> {
  const name = username.trim();
  if (!name) throw new Error("Enter an AniList username.");

  const raw: RawEntry[] = [];
  let chunk = 1;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { name, chunk } }),
    });
    if (!res.ok) throw new Error(`AniList HTTP ${res.status} — try again in a moment.`);
    const json = (await res.json()) as {
      data?: {
        MediaListCollection?: {
          hasNextChunk?: boolean;
          lists?: Array<{ entries?: RawEntry[] }>;
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(
        /not found/i.test(json.errors[0].message)
          ? `AniList user “${name}” was not found.`
          : "That list is private or unavailable.",
      );
    }
    const collection = json.data?.MediaListCollection;
    if (!collection) throw new Error(`No public anime list for “${name}”.`);
    for (const list of collection.lists ?? []) {
      raw.push(...(list.entries ?? []));
    }
    if (!collection.hasNextChunk) break;
    chunk += 1;
  }

  const entries: AniListImportEntry[] = [];
  const byStatus: Record<LibraryStatus, number> = {
    watching: 0,
    completed: 0,
    plan_to_watch: 0,
    on_hold: 0,
    dropped: 0,
  };
  let rated = 0;

  for (const e of raw) {
    if (!e.media?.id) continue;
    const mapped = mapAniListStatus(e.status);
    const score = e.score >= 1 && e.score <= 10 ? Math.round(e.score) : undefined;
    if (score !== undefined) rated += 1;
    byStatus[mapped.status] += 1;
    entries.push({
      anilistId: e.media.id,
      status: mapped.status,
      progress: Math.max(0, e.progress || 0),
      score,
      rewatch: mapped.rewatch,
      anime: toSummary(e.media),
    });
  }

  if (entries.length === 0) throw new Error(`“${name}” has an empty public anime list.`);
  return { username: name, entries, byStatus, rated };
}
