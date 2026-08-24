import { Link } from "react-router";
import { animeTitle, anilistScore10, seasonLabel } from "@/lib/media";
import type { AnimeSummary } from "@/types/anime";
import { PosterImage } from "./Poster";

export interface RecPick {
  anilistId: number;
  title: { romaji: string; english?: string; native?: string };
  coverImage?: string;
  genres: string[];
  seasonYear?: number;
  season?: string;
  format?: string;
  anilistScore?: number;
  reason?: string;
}

export function recPickFromAnime(anime: AnimeSummary, reason?: string): RecPick {
  return {
    anilistId: anime.anilistId,
    title: anime.title,
    coverImage: anime.coverImage,
    genres: anime.genres,
    seasonYear: anime.seasonYear,
    season: anime.season,
    format: anime.format,
    anilistScore: anime.anilistScore,
    reason,
  };
}

/** Cover + title + in-app link. Used under Ren's recs. */
export function RecPickCard({ pick }: { pick: RecPick }) {
  const name = animeTitle(pick);
  const meta = [seasonLabel(pick.season, pick.seasonYear), pick.format?.replace(/_/g, " ")]
    .filter(Boolean)
    .join(" · ");
  const score = anilistScore10(pick.anilistScore);

  return (
    <Link
      to={`/anime/${pick.anilistId}`}
      className="group flex gap-3 overflow-hidden rounded-xl border border-border bg-card p-2 pressable poster-shadow"
    >
      <div className="h-[5.5rem] w-[3.7rem] shrink-0 overflow-hidden rounded-md bg-muted">
        <PosterImage src={pick.coverImage} alt="" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:underline">
          {name}
        </p>
        {meta && <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p>}
        {score && <p className="mt-0.5 text-[11px] text-muted-foreground">AniList {score}</p>}
        {pick.reason && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{pick.reason}</p>
        )}
      </div>
    </Link>
  );
}
