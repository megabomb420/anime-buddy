import { Link } from "react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { animeTitle } from "@/lib/media";
import type { AnimeSummary } from "@/types/anime";

function FallbackMark({ title }: { title: string }) {
  const letter = title.trim().charAt(0).toUpperCase() || "A";
  return (
    <div className="flex h-full w-full items-end bg-gradient-to-br from-secondary to-background p-3">
      <span className="text-4xl font-semibold leading-none text-foreground/70">{letter}</span>
    </div>
  );
}

export function PosterImage({
  src,
  alt,
  className,
  priority,
}: {
  src?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <FallbackMark title={alt} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function Poster({
  anime,
  className,
  priority,
  showTitle = false,
}: {
  anime: Pick<AnimeSummary, "anilistId" | "title" | "coverImage">;
  className?: string;
  priority?: boolean;
  showTitle?: boolean;
}) {
  const title = animeTitle(anime);
  return (
    <Link
      to={`/anime/${anime.anilistId}`}
      className={cn(
        "group relative block shrink-0 overflow-hidden rounded-lg pressable poster-shadow poster-lift",
        className,
      )}
      aria-label={title}
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]">
          <PosterImage src={anime.coverImage} alt="" priority={priority} />
        </div>
      </div>
      {showTitle && (
        <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-foreground/90">{title}</p>
      )}
      <span className="sr-only">{title}</span>
    </Link>
  );
}
