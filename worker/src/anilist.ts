/**
 * AniList GraphQL from the Worker — Ren's catalog tools.
 * Public API, no key. Compact results only; never dump a page of media.
 */

const ANILIST_URL = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large extraLarge }
  format
  status
  season
  seasonYear
  episodes
  genres
  averageScore
  studios { nodes { name } }
  description(asHtml: false)
  relations {
    edges {
      relationType(version: 2)
      node { id title { romaji english } }
    }
  }
`;

export interface CatalogPick {
  anilistId: number;
  title: { romaji: string; english?: string; native?: string };
  coverImage?: string;
  genres: string[];
  seasonYear?: number;
  season?: string;
  format?: string;
  anilistScore?: number;
}

interface Media {
  id: number;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage?: { large?: string; extraLarge?: string } | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  genres?: string[] | null;
  averageScore?: number | null;
  studios?: { nodes?: Array<{ name: string }> | null } | null;
  description?: string | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: { id: number; title?: { romaji?: string | null; english?: string | null } | null } | null;
    }> | null;
  } | null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`AniList: ${json.errors[0].message}`);
  if (!json.data) throw new Error("AniList: empty response");
  return json.data;
}

function compact(m: Media): Record<string, unknown> {
  const relations = (m.relations?.edges ?? [])
    .filter((e) => e.node)
    .slice(0, 4)
    .map((e) => ({
      type: e.relationType,
      anilistId: e.node!.id,
      title: e.node!.title?.english || e.node!.title?.romaji,
    }));
  return {
    anilistId: m.id,
    title: m.title.english || m.title.romaji,
    romaji: m.title.romaji,
    english: m.title.english ?? undefined,
    format: m.format ?? undefined,
    status: m.status ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    episodes: m.episodes ?? undefined,
    genres: (m.genres ?? []).slice(0, 6),
    studios: (m.studios?.nodes ?? []).map((s) => s.name).slice(0, 3),
    anilistScore: m.averageScore != null ? (m.averageScore / 10).toFixed(1) : undefined,
    synopsis: m.description ? stripHtml(m.description).slice(0, 220) : undefined,
    relations: relations.length ? relations : undefined,
  };
}

export function pickFromMedia(m: Media): CatalogPick {
  return {
    anilistId: m.id,
    title: {
      romaji: m.title.romaji,
      english: m.title.english ?? undefined,
      native: m.title.native ?? undefined,
    },
    coverImage: m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined,
    genres: m.genres ?? [],
    seasonYear: m.seasonYear ?? undefined,
    season: m.season ?? undefined,
    format: m.format ?? undefined,
    anilistScore: m.averageScore ?? undefined,
  };
}

export async function searchAnime(query: string, limit = 6): Promise<Media[]> {
  const data = await gql<{ Page: { media: Media[] } }>(
    `query ($search: String!, $perPage: Int!) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
      }
    }`,
    { search: query.slice(0, 80), perPage: Math.min(limit, 8) },
  );
  return data.Page.media ?? [];
}

export async function getAnime(anilistId: number): Promise<Media | null> {
  const data = await gql<{ Media: Media | null }>(
    `query ($id: Int!) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`,
    { id: anilistId },
  );
  return data.Media;
}

export async function browseList(
  list: "trending" | "popular" | "seasonal",
  limit = 8,
): Promise<Media[]> {
  const perPage = Math.min(limit, 10);
  if (list === "seasonal") {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const season = month <= 2 ? "WINTER" : month <= 5 ? "SPRING" : month <= 8 ? "SUMMER" : "FALL";
    const data = await gql<{ Page: { media: Media[] } }>(
      `query ($season: MediaSeason!, $year: Int!, $perPage: Int!) {
        Page(perPage: $perPage) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
        }
      }`,
      { season, year, perPage },
    );
    return data.Page.media ?? [];
  }
  const sort = list === "trending" ? "TRENDING_DESC" : "POPULARITY_DESC";
  const data = await gql<{ Page: { media: Media[] } }>(
    `query ($sort: [MediaSort], $perPage: Int!) {
      Page(perPage: $perPage) {
        media(type: ANIME, sort: $sort) { ${MEDIA_FIELDS} }
      }
    }`,
    { sort: [sort], perPage },
  );
  return data.Page.media ?? [];
}

export async function searchCharacters(query: string, limit = 5): Promise<
  Array<{
    id: number;
    name: string;
    native?: string;
    anime: Array<{ anilistId: number; title: string }>;
    description?: string;
  }>
> {
  const data = await gql<{
    Page: {
      characters: Array<{
        id: number;
        name: { full: string; native?: string | null };
        description?: string | null;
        media?: {
          nodes?: Array<{ id: number; title?: { romaji?: string | null; english?: string | null } | null }> | null;
        } | null;
      }>;
    };
  }>(
    `query ($search: String!, $perPage: Int!) {
      Page(perPage: $perPage) {
        characters(search: $search, sort: SEARCH_MATCH) {
          id
          name { full native }
          description
          media(type: ANIME, sort: POPULARITY_DESC, perPage: 4) {
            nodes { id title { romaji english } }
          }
        }
      }
    }`,
    { search: query.slice(0, 80), perPage: Math.min(limit, 6) },
  );
  return (data.Page.characters ?? []).map((c) => ({
    id: c.id,
    name: c.name.full,
    native: c.name.native ?? undefined,
    description: c.description ? stripHtml(c.description).slice(0, 180) : undefined,
    anime: (c.media?.nodes ?? []).map((n) => ({
      anilistId: n.id,
      title: n.title?.english || n.title?.romaji || `#${n.id}`,
    })),
  }));
}

export function compactMedia(m: Media): Record<string, unknown> {
  return compact(m);
}
