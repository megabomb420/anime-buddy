/**
 * Pure catalog-ask parser + fact packing. No AniList fetch, no UI.
 * Safe to unit-test under node --test (no Vite aliases).
 */

import { wantsRecommendation } from "./buddy-intent.ts";
import { parseBuddyWriteIntent, parseLibraryReadIntent } from "./buddy-library.ts";
import { parseLookupQuery } from "./catalog-search.ts";
import { animeTitle, anilistScore10, seasonLabel } from "./media.ts";
import type { AnimeSummary } from "../types/anime.ts";

export type CatalogAskKind = "rec" | "lookup" | "character" | "browse" | "none";
export type BrowseList = "trending" | "popular" | "seasonal";

export interface CatalogAsk {
  kind: CatalogAskKind;
  query?: string;
  browse?: BrowseList;
}

export interface CatalogFact {
  anilistId: number;
  title: string;
  english?: string;
  format?: string;
  status?: string;
  season?: string;
  episodes?: number;
  genres: string[];
  studios?: string[];
  score?: string;
  synopsis?: string;
  relations?: string[];
  characters?: string[];
}

const LOOKUP_LEAD =
  /^(?:ile odcink[oó]w(?: ma)?|how many episodes(?: (?:does|are in|in|is))?|tell me about|opowiedz(?: mi)? o|co wiesz o|co to(?: jest)?|czym jest|kiedy (?:wysz[eł][oa]|premier\w*)|studio (?:od|of)?|jaka ocena|ocena|score (?:of|for)?|gdzie ogląda[cć])\s+/i;

const CHARACTER_LEAD = /^(?:kto to(?: jest)?|who(?:'s| is)|posta[cć]|character|co to za posta[cć])\s+/i;

export const CAST_LEAD =
  /(?:kto (?:jest |gra )?w|cast of|characters? (?:in|from)|posta[cć]ie? (?:z|w))\s+/i;

const BROWSE_TRENDING =
  /\b(trending|hype|na topie|teraz (?:leci|idzie|popularn)|what'?s trending|co teraz ogląda[cć])\b/i;
const BROWSE_POPULAR = /\b(najpopularn\w*|most popular|popular (?:right )?now)\b/i;
const BROWSE_SEASON = /\b(this season|ten sezon|sezonow\w+|seasonal|nowy sezon|current season)\b/i;

function stripTail(s: string): string {
  return s.replace(/[?!.…]+$/g, "").replace(/\s+/g, " ").trim();
}

function quotedTitle(text: string): string | undefined {
  const m = text.match(/["“”«»](.+?)["“”«»]/);
  const inner = m?.[1]?.trim();
  return inner && inner.length >= 2 ? inner : undefined;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** What AniList should fetch for this turn — never a vague rec as a title search. */
export function parseCatalogAsk(raw: string): CatalogAsk {
  const text = raw.trim();
  if (text.length < 2) return { kind: "none" };
  if (parseBuddyWriteIntent(text)) return { kind: "none" };
  if (parseLibraryReadIntent(text)) return { kind: "none" };
  if (parseLookupQuery(text)) return { kind: "none" };
  if (wantsRecommendation(text)) return { kind: "rec" };

  if (BROWSE_SEASON.test(text)) return { kind: "browse", browse: "seasonal" };
  if (BROWSE_TRENDING.test(text)) return { kind: "browse", browse: "trending" };
  if (BROWSE_POPULAR.test(text)) return { kind: "browse", browse: "popular" };

  const quoted = quotedTitle(text);

  if (CAST_LEAD.test(text)) {
    const rest = stripTail(text.replace(CAST_LEAD, ""));
    return { kind: "lookup", query: quoted ?? rest };
  }

  if (CHARACTER_LEAD.test(text)) {
    const rest = stripTail(text.replace(CHARACTER_LEAD, ""));
    return { kind: "character", query: quoted ?? rest };
  }

  if (LOOKUP_LEAD.test(text)) {
    const rest = stripTail(text.replace(LOOKUP_LEAD, ""));
    const cleaned = rest.replace(/^(?:warto|worth(?: it)?|dobre)\s*/i, "").trim();
    return { kind: "lookup", query: quoted ?? cleaned };
  }

  if (quoted) return { kind: "lookup", query: quoted };

  return { kind: "none" };
}

export function factFromAnime(anime: AnimeSummary, extra?: { characters?: string[] }): CatalogFact {
  const relations = (anime.relations ?? [])
    .slice(0, 4)
    .map((r) => `${r.relationType}: ${r.title.english || r.title.romaji} (#${r.anilistId})`);
  const synopsis = anime.synopsis ? stripHtml(anime.synopsis).slice(0, 220) : undefined;
  return {
    anilistId: anime.anilistId,
    title: animeTitle(anime),
    english: anime.title.english,
    format: anime.format,
    status: anime.status,
    season: seasonLabel(anime.season, anime.seasonYear),
    episodes: anime.episodes,
    genres: anime.genres.slice(0, 6),
    studios: anime.studios?.slice(0, 3),
    score: anilistScore10(anime.anilistScore),
    synopsis,
    relations: relations.length ? relations : undefined,
    characters: extra?.characters,
  };
}

export function formatCatalogFacts(facts: CatalogFact[]): string {
  if (!facts.length) return "";
  return facts
    .map((f) => {
      const bits = [
        `#${f.anilistId} ${f.title}`,
        f.format,
        f.status,
        f.season,
        f.episodes != null ? `${f.episodes} eps` : undefined,
        f.score ? `AniList ${f.score}` : undefined,
        f.genres.length ? f.genres.join(", ") : undefined,
        f.studios?.length ? f.studios.join(", ") : undefined,
      ].filter(Boolean);
      const lines = [bits.join(" · ")];
      if (f.synopsis) lines.push(`Plot: ${f.synopsis}`);
      if (f.relations?.length) lines.push(`Related: ${f.relations.join("; ")}`);
      if (f.characters?.length) lines.push(`Characters: ${f.characters.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function factsFromPicks(animes: AnimeSummary[]): { facts: CatalogFact[]; factsText: string } {
  const facts = animes.slice(0, 4).map((a) => factFromAnime(a));
  return { facts, factsText: formatCatalogFacts(facts) };
}
