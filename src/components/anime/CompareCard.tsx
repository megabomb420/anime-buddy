import { Link } from "react-router";
import { animeTitle, anilistScore10, formatLabel, seasonLabel } from "@/lib/media";
import type { AnimeSummary } from "@/types/anime";
import { PosterImage } from "./Poster";

const STATUS_LABEL: Record<string, string> = {
  FINISHED: "Finished",
  RELEASING: "Airing",
  NOT_YET_RELEASED: "Upcoming",
  CANCELLED: "Cancelled",
  HIATUS: "Hiatus",
};

interface StatRow {
  label: string;
  value: (anime: AnimeSummary) => string | undefined;
}

const STAT_ROWS: StatRow[] = [
  { label: "AniList", value: (a) => anilistScore10(a.anilistScore) },
  { label: "Episodes", value: (a) => (a.episodes ? String(a.episodes) : undefined) },
  { label: "Status", value: (a) => (a.status ? (STATUS_LABEL[a.status] ?? a.status) : undefined) },
  { label: "Format", value: (a) => formatLabel(a.format) },
  { label: "Season", value: (a) => seasonLabel(a.season, a.seasonYear) },
  { label: "Genres", value: (a) => a.genres.slice(0, 3).join(", ") || undefined },
  { label: "Studio", value: (a) => a.studios?.[0] },
];

/**
 * Side-by-side compare of two catalog titles. Both sides are AniList-resolved
 * AnimeSummary records — nothing here is AI-generated.
 */
export function CompareCard({ a, b }: { a: AnimeSummary; b: AnimeSummary }) {
  const sides = [a, b];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card poster-shadow">
      <div className="grid grid-cols-2">
        {sides.map((side) => (
          <Link
            key={side.anilistId}
            to={`/anime/${side.anilistId}`}
            className="group block p-2 pressable"
            aria-label={animeTitle(side)}
          >
            <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-muted">
              <PosterImage src={side.coverImage} alt="" />
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-foreground group-hover:underline">
              {animeTitle(side)}
            </p>
          </Link>
        ))}
      </div>
      <div className="border-t border-border">
        {STAT_ROWS.map((row) => {
          const va = row.value(a);
          const vb = row.value(b);
          if (!va && !vb) return null;
          return (
            <div key={row.label} className="border-b border-border/60 px-2 py-1 last:border-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {row.label}
              </p>
              <div className="mt-0.5 grid grid-cols-2 text-[11px] leading-snug text-foreground/90">
                <span className="pr-2">{va ?? "—"}</span>
                <span className="border-l border-border/60 pl-2">{vb ?? "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
