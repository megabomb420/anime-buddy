/**
 * Buddy's AniList hands. Ren talks; this layer looks titles up so he
 * never has to invent episode counts, scores, or names.
 */

import { persistence } from "@/lib/db/persistence";
import { animeTitle } from "@/lib/media";
import { providers } from "@/lib/providers";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import type { AnimeSummary, CharacterSummary } from "@/types/anime";
import {
  CAST_LEAD,
  factFromAnime,
  formatCatalogFacts,
  parseCatalogAsk,
  type CatalogAsk,
  type CatalogFact,
} from "./buddy-catalog-ask";

export {
  factFromAnime,
  factsFromPicks,
  formatCatalogFacts,
  parseCatalogAsk,
  type BrowseList,
  type CatalogAsk,
  type CatalogAskKind,
  type CatalogFact,
} from "./buddy-catalog-ask";

export interface BuddyCatalog {
  ask: CatalogAsk;
  animes: AnimeSummary[];
  facts: CatalogFact[];
  factsText: string;
  libraryBrief: string;
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

async function libraryBrief(): Promise<string> {
  try {
    const lib = await persistence.getLibrary();
    if (!lib.length) return "";
    const bits: string[] = [];
    for (const e of lib.slice(0, 20)) {
      const cached = await persistence.getCachedAnime(e.anilistId);
      bits.push(`${cached ? animeTitle(cached) : `#${e.anilistId}`} (${e.status})`);
    }
    return bits.join("; ");
  } catch {
    return "";
  }
}

async function withCast(anime: AnimeSummary): Promise<CatalogFact> {
  try {
    const chars = await providers.catalog.getCharacters(anime.anilistId);
    const names = chars.slice(0, 8).map((c) => c.name);
    return factFromAnime(anime, { characters: names.length ? names : undefined });
  } catch {
    return factFromAnime(anime);
  }
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

async function fromCharacters(chars: CharacterSummary[]): Promise<AnimeSummary[]> {
  const ids: number[] = [];
  for (const c of chars) {
    for (const id of c.animeIds) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  const animes: AnimeSummary[] = [];
  for (const id of ids.slice(0, 4)) {
    const a = await animeCatalogService.getAnime(id);
    if (a) animes.push(a);
  }
  return animes;
}

/**
 * Pull AniList for this chat turn. Rec asks are marked but not fetched here —
 * BuddyPage still uses RecommendationService for those.
 */
export async function resolveBuddyCatalog(text: string): Promise<BuddyCatalog> {
  const ask = parseCatalogAsk(text);
  const brief = await libraryBrief();
  const empty: BuddyCatalog = {
    ask,
    animes: [],
    facts: [],
    factsText: "",
    libraryBrief: brief,
  };

  try {
    if (ask.kind === "browse" && ask.browse) {
      const list =
        ask.browse === "trending"
          ? await animeCatalogService.getTrending(8)
          : ask.browse === "popular"
            ? await animeCatalogService.getPopular(8)
            : await animeCatalogService.getSeasonal(
                currentSeason().season,
                currentSeason().year,
                8,
              );
      const animes = uniqueAnime(list).slice(0, 4);
      const facts = animes.map((a) => factFromAnime(a));
      return {
        ask,
        animes,
        facts,
        factsText: formatCatalogFacts(facts),
        libraryBrief: brief,
      };
    }

    if (ask.kind === "character" && ask.query && ask.query.length >= 2) {
      const chars = await animeCatalogService.searchCharacters(ask.query, 5);
      const animes = uniqueAnime(await fromCharacters(chars)).slice(0, 3);
      const facts = animes.map((a) => {
        const names = chars
          .filter((c) => c.animeIds.includes(a.anilistId))
          .map((c) => c.name);
        return factFromAnime(a, { characters: names.length ? names : undefined });
      });
      if (!facts.length && chars.length) {
        const fake: CatalogFact[] = chars.slice(0, 3).map((c) => ({
          anilistId: c.animeIds[0] ?? 0,
          title: c.name,
          genres: [],
          characters: [c.name],
          synopsis: c.description
            ? c.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)
            : undefined,
        }));
        return {
          ask,
          animes,
          facts: fake,
          factsText: formatCatalogFacts(fake),
          libraryBrief: brief,
        };
      }
      return {
        ask,
        animes,
        facts,
        factsText: formatCatalogFacts(facts),
        libraryBrief: brief,
      };
    }

    if (ask.kind === "lookup" && ask.query && ask.query.length >= 2) {
      const found = uniqueAnime(await animeCatalogService.search(ask.query, 6)).slice(0, 3);
      if (!found.length) return empty;
      const wantCast = CAST_LEAD.test(text);
      const facts = wantCast
        ? await Promise.all(found.slice(0, 2).map((a) => withCast(a)))
        : found.map((a) => factFromAnime(a));
      return {
        ask,
        animes: found.slice(0, 2),
        facts,
        factsText: formatCatalogFacts(facts),
        libraryBrief: brief,
      };
    }
  } catch {
    return empty;
  }

  return empty;
}
