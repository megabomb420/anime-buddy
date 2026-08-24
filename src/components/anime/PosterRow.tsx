import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { animeTitle } from "@/lib/media";
import { Poster } from "./Poster";
import { PosterSkeleton } from "./Skeletons";
import type { AnimeSummary } from "@/types/anime";

export function SectionHeader({
  title,
  href,
  action,
  kicker,
}: {
  title: string;
  href?: string;
  action?: ReactNode;
  kicker?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-4">
      <div className="min-w-0">
        {kicker && (
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {kicker}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {action}
      {href && (
        <Link
          to={href}
          className="inline-flex h-9 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
        >
          See all
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function PosterRow({
  items,
  loading,
  className,
  size = "md",
  reasons,
  onFeedback,
}: {
  items: AnimeSummary[];
  loading?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Optional per-item reason line, keyed by AniList id (For you row). */
  reasons?: Record<number, string>;
  /** Optional tap feedback under each poster (For you row). */
  onFeedback?: (anilistId: number, kind: "like" | "not_for_me") => void;
}) {
  const width = size === "sm" ? "w-28" : size === "lg" ? "w-48" : "w-40";

  if (loading) {
    return (
      <div className={cn("flex gap-3 overflow-hidden px-4", className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <PosterSkeleton key={i} className={width} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1", className)}>
      {items.map((anime, i) => {
        const reason = reasons?.[anime.anilistId];
        if (!reason && !onFeedback) {
          return (
            <Poster
              key={anime.anilistId}
              anime={anime}
              className={cn(width, "snap-start poster-enter")}
              showTitle
              priority={i < 4}
            />
          );
        }
        return (
          <div key={anime.anilistId} className={cn(width, "shrink-0 snap-start poster-enter")}>
            <Poster anime={anime} className="w-full" priority={i < 4} />
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-foreground/90">
              {animeTitle(anime)}
            </p>
            {reason && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{reason}</p>
            )}
            {onFeedback && (
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  aria-label="Interested"
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onFeedback(anime.anilistId, "like")}
                >
                  <Heart className="h-3 w-3" /> Interested
                </button>
                <button
                  type="button"
                  aria-label="Not for me"
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onFeedback(anime.anilistId, "not_for_me")}
                >
                  <X className="h-3 w-3" /> Not for me
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
