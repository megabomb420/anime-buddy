import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
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
}: {
  items: AnimeSummary[];
  loading?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
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
      {items.map((anime, i) => (
        <Poster
          key={anime.anilistId}
          anime={anime}
          className={cn(width, "snap-start poster-enter")}
          showTitle
          priority={i < 4}
        />
      ))}
    </div>
  );
}
