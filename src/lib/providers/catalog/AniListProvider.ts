/**
 * AniList GraphQL provider — PRIMARY anime/character metadata source and
 * canonical identity. Public API, no key required.
 *
 * https://anilist.gitbook.io/anilist-apiv2-docs
 */

import type { AnimeSummary, CharacterSummary } from "@/types/anime";
import type { CatalogProvider } from "./types";

const ANILIST_URL = "https://graphql.anilist.co";

const ANIME_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { large }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  genres
  tags { name }
  description(asHtml: false)
  averageScore
  isAdult
  streamingEpisodes { site url }
  externalLinks { site url }
  studios { nodes { name } }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        title { romaji english native }
        coverImage { large }
        format
        status
      }
    }
  }
`;

interface AnilistMedia {
  id: number;
  idMal?: number | null;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage?: { large?: string } | null;
  bannerImage?: string | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  genres?: string[] | null;
  tags?: Array<{ name: string }> | null;
  description?: string | null;
  averageScore?: number | null;
  isAdult?: boolean | null;
  streamingEpisodes?: Array<{ site: string; url: string }> | null;
  externalLinks?: Array<{ site: string; url: string }> | null;
  studios?: { nodes?: Array<{ name: string }> | null } | null;
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: {
        id: number;
        title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
        coverImage?: { large?: string } | null;
        format?: string | null;
        status?: string | null;
      } | null;
    }> | null;
  } | null;
}

function toSummary(m: AnilistMedia): AnimeSummary {
  const studios = m.studios?.nodes?.filter(Boolean).map((s) => s.name) ?? [];
  const relations =
    m.relations?.edges
      ?.filter((e) => e.node != null)
      .map((e) => ({
        anilistId: e.node!.id,
        relationType: e.relationType ?? "Related",
        title: {
          romaji: e.node!.title?.romaji ?? "",
          english: e.node!.title?.english ?? undefined,
          native: e.node!.title?.native ?? undefined,
        },
        coverImage: e.node!.coverImage?.large ?? undefined,
        format: e.node!.format ?? undefined,
        status: e.node!.status ?? undefined,
      })) ?? [];

  return {
    anilistId: m.id,
    malId: m.idMal ?? undefined,
    title: {
      romaji: m.title.romaji,
      english: m.title.english ?? undefined,
      native: m.title.native ?? undefined,
    },
    coverImage: m.coverImage?.large ?? undefined,
    bannerImage: m.bannerImage ?? undefined,
    format: m.format ?? undefined,
    status: m.status ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    episodes: m.episodes ?? undefined,
    genres: m.genres ?? [],
    tags: (m.tags ?? []).map((t) => t.name),
    synopsis: m.description ?? undefined,
    anilistScore: m.averageScore ?? undefined,
    isAdult: m.isAdult ?? false,
    streamingLinks: m.streamingEpisodes ?? [],
    externalLinks: m.externalLinks ?? [],
    studios: studios.length > 0 ? studios : undefined,
    relations: relations.length > 0 ? relations : undefined,
    cachedAt: Date.now(),
  };
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

export class AniListProvider implements CatalogProvider {
  readonly name = "anilist";

  async searchAnime(query: string, limit = 20): Promise<AnimeSummary[]> {
    const data = await gql<{ Page: { media: AnilistMedia[] } }>(
      `query ($search: String!, $perPage: Int!) {
        Page(perPage: $perPage) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${ANIME_FIELDS} }
        }
      }`,
      { search: query, perPage: limit },
    );
    return data.Page.media.map(toSummary);
  }

  async getAnime(anilistId: number): Promise<AnimeSummary | null> {
    const data = await gql<{ Media: AnilistMedia | null }>(
      `query ($id: Int!) { Media(id: $id, type: ANIME) { ${ANIME_FIELDS} } }`,
      { id: anilistId },
    );
    return data.Media ? toSummary(data.Media) : null;
  }

  async getTrending(limit = 20): Promise<AnimeSummary[]> {
    const data = await gql<{ Page: { media: AnilistMedia[] } }>(
      `query ($perPage: Int!) {
        Page(perPage: $perPage) {
          media(type: ANIME, sort: TRENDING_DESC, status_in: [RELEASING, NOT_YET_RELEASED]) { ${ANIME_FIELDS} }
        }
      }`,
      { perPage: limit },
    );
    return data.Page.media.map(toSummary);
  }

  async getPopular(limit = 20): Promise<AnimeSummary[]> {
    const data = await gql<{ Page: { media: AnilistMedia[] } }>(
      `query ($perPage: Int!) {
        Page(perPage: $perPage) {
          media(type: ANIME, sort: POPULARITY_DESC) { ${ANIME_FIELDS} }
        }
      }`,
      { perPage: limit },
    );
    return data.Page.media.map(toSummary);
  }

  async getSeasonal(season: string, year: number, limit = 20): Promise<AnimeSummary[]> {
    const data = await gql<{ Page: { media: AnilistMedia[] } }>(
      `query ($season: MediaSeason!, $year: Int!, $perPage: Int!) {
        Page(perPage: $perPage) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) { ${ANIME_FIELDS} }
        }
      }`,
      { season, year, perPage: limit },
    );
    return data.Page.media.map(toSummary);
  }

  async getCharacters(anilistId: number): Promise<CharacterSummary[]> {
    const data = await gql<{
      Media: {
        characters: {
          nodes: Array<{
            id: number;
            name: { full: string; native?: string | null };
            image?: { large?: string } | null;
            description?: string | null;
            favourites?: number | null;
          }>;
        };
      } | null;
    }>(
      `query ($id: Int!) {
        Media(id: $id, type: ANIME) {
          characters(perPage: 25, sort: ROLE) {
            nodes { id name { full native } image { large } description favourites }
          }
        }
      }`,
      { id: anilistId },
    );
    return (data.Media?.characters.nodes ?? []).map((c) => ({
      id: c.id,
      name: c.name.full,
      nameNative: c.name.native ?? undefined,
      image: c.image?.large ?? undefined,
      animeIds: [anilistId],
      description: c.description ?? undefined,
      favorites: c.favourites ?? undefined,
      cachedAt: Date.now(),
    }));
  }

  async getCharacter(characterId: number): Promise<CharacterSummary | null> {
    const data = await gql<{
      Character: {
        id: number;
        name: { full: string; native?: string | null };
        image?: { large?: string } | null;
        description?: string | null;
        favourites?: number | null;
        media?: { nodes?: Array<{ id: number }> | null } | null;
      } | null;
    }>(
      `query ($id: Int!) {
        Character(id: $id) {
          id
          name { full native }
          image { large }
          description
          favourites
          media(type: ANIME, sort: POPULARITY_DESC, perPage: 8) {
            nodes { id }
          }
        }
      }`,
      { id: characterId },
    );
    const c = data.Character;
    if (!c) return null;
    return {
      id: c.id,
      name: c.name.full,
      nameNative: c.name.native ?? undefined,
      image: c.image?.large ?? undefined,
      animeIds: (c.media?.nodes ?? []).map((n) => n.id),
      description: c.description ?? undefined,
      favorites: c.favourites ?? undefined,
      cachedAt: Date.now(),
    };
  }

  async searchCharacters(query: string, limit = 8): Promise<CharacterSummary[]> {
    const data = await gql<{
      Page: {
        characters: Array<{
          id: number;
          name: { full: string; native?: string | null };
          image?: { large?: string } | null;
          description?: string | null;
          favourites?: number | null;
          media?: { nodes?: Array<{ id: number }> | null } | null;
        }>;
      };
    }>(
      `query ($search: String!, $perPage: Int!) {
        Page(perPage: $perPage) {
          characters(search: $search, sort: SEARCH_MATCH) {
            id
            name { full native }
            image { large }
            description
            favourites
            media(type: ANIME, sort: POPULARITY_DESC, perPage: 4) {
              nodes { id }
            }
          }
        }
      }`,
      { search: query, perPage: limit },
    );
    return data.Page.characters.map((c) => ({
      id: c.id,
      name: c.name.full,
      nameNative: c.name.native ?? undefined,
      image: c.image?.large ?? undefined,
      animeIds: (c.media?.nodes ?? []).map((n) => n.id),
      description: c.description ?? undefined,
      favorites: c.favourites ?? undefined,
      cachedAt: Date.now(),
    }));
  }
}
