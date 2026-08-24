import {
  browseList,
  compactMedia,
  getAnime,
  pickFromMedia,
  searchAnime,
  searchCharacters,
  type CatalogPick,
} from "./anilist";

export const CATALOG_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_anime",
      description:
        "Search AniList for anime by title or keywords. Call this before naming a title as fact.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Title or keywords" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_anime",
      description:
        "Fetch one AniList title by id: episodes, score, genres, studios, synopsis, relations.",
      parameters: {
        type: "object",
        properties: {
          anilistId: { type: "integer", description: "AniList media id" },
        },
        required: ["anilistId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_catalog",
      description: "Live AniList lists: trending, popular, or the current season.",
      parameters: {
        type: "object",
        properties: {
          list: {
            type: "string",
            enum: ["trending", "popular", "seasonal"],
          },
        },
        required: ["list"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_character",
      description: "Search AniList characters by name. Returns the character and their anime.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Character name" },
        },
        required: ["query"],
      },
    },
  },
] as const;

export interface ToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

function remember(picks: Map<number, CatalogPick>, media: Parameters<typeof pickFromMedia>[0]) {
  const pick = pickFromMedia(media);
  if (!picks.has(pick.anilistId)) picks.set(pick.anilistId, pick);
}

export async function runCatalogTool(
  name: string,
  rawArgs: string,
  picks: Map<number, CatalogPick>,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "bad_arguments" });
  }

  try {
    switch (name) {
      case "search_anime": {
        const query = String(args.query ?? "").trim();
        if (query.length < 2) return JSON.stringify({ error: "query_too_short" });
        const list = await searchAnime(query, 6);
        for (const m of list) remember(picks, m);
        return JSON.stringify({ results: list.map(compactMedia) });
      }
      case "get_anime": {
        const id = Number(args.anilistId);
        if (!Number.isFinite(id) || id <= 0) return JSON.stringify({ error: "bad_id" });
        const media = await getAnime(id);
        if (!media) return JSON.stringify({ error: "not_found" });
        remember(picks, media);
        return JSON.stringify(compactMedia(media));
      }
      case "browse_catalog": {
        const list = String(args.list ?? "trending");
        const kind =
          list === "popular" || list === "seasonal" || list === "trending" ? list : "trending";
        const media = await browseList(kind, 8);
        for (const m of media) remember(picks, m);
        return JSON.stringify({ list: kind, results: media.slice(0, 6).map(compactMedia) });
      }
      case "search_character": {
        const query = String(args.query ?? "").trim();
        if (query.length < 2) return JSON.stringify({ error: "query_too_short" });
        const chars = await searchCharacters(query, 5);
        for (const c of chars) {
          for (const a of c.anime.slice(0, 1)) {
            const media = await getAnime(a.anilistId).catch(() => null);
            if (media) remember(picks, media);
          }
        }
        return JSON.stringify({ results: chars });
      }
      default:
        return JSON.stringify({ error: "unknown_tool" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "anilist_failed";
    return JSON.stringify({ error: message });
  }
}

export function picksList(picks: Map<number, CatalogPick>, limit = 4): CatalogPick[] {
  return [...picks.values()].slice(0, limit);
}
