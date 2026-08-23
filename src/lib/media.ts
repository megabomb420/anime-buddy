import type { AnimeSummary, AnimeTitle } from "@/types/anime";

export function displayTitle(title: AnimeTitle | undefined, fallback = "Untitled"): string {
  if (!title) return fallback;
  return title.english || title.romaji || title.native || fallback;
}

export function animeTitle(anime: Pick<AnimeSummary, "title" | "anilistId">): string {
  return displayTitle(anime.title, `Anime #${anime.anilistId}`);
}

export function formatLabel(format?: string): string | undefined {
  if (!format) return undefined;
  return format.replace(/_/g, " ");
}

export function seasonLabel(season?: string, year?: number): string | undefined {
  if (!season && !year) return undefined;
  const s = season ? season.charAt(0) + season.slice(1).toLowerCase() : undefined;
  if (s && year) return `${s} ${year}`;
  return s ?? String(year);
}

export function anilistScore10(score?: number): string | undefined {
  if (score === undefined) return undefined;
  return (score / 10).toFixed(1);
}
