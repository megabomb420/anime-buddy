import { useRef, type TouchEvent } from "react";
import { Link } from "react-router";
import { MessageCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgeBadge } from "@/components/AgeBadge";
import { anilistScore10, animeTitle, formatLabel, seasonLabel } from "@/lib/media";
import { PosterImage } from "./Poster";
import type { AnimeSummary } from "@/types/anime";

/** Min horizontal distance (px) for a hero swipe; vertical scroll stays scroll. */
const SWIPE_MIN_PX = 48;

export function FeaturedHero({
  anime,
  index = 0,
  total = 1,
  onSelectIndex,
}: {
  anime: AnimeSummary;
  index?: number;
  total?: number;
  onSelectIndex?: (i: number) => void;
}) {
  const title = animeTitle(anime);
  const score = anilistScore10(anime.anilistScore);
  const cover = anime.coverImage;
  const banner = anime.bannerImage;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const native =
    anime.title.native && anime.title.native !== title
      ? anime.title.native
      : anime.title.romaji !== title
        ? anime.title.romaji
        : undefined;

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || total < 2 || !onSelectIndex) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    // Swipe left → next title, swipe right → previous.
    const next = dx < 0 ? (index + 1) % total : (index - 1 + total) % total;
    onSelectIndex(next);
  }

  return (
    <section
      className="relative isolate h-[min(78dvh,640px)] min-h-[460px] overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div className="hero-art">
          <PosterImage
            src={cover || banner}
            alt=""
            priority
            className="h-full w-full object-cover object-top"
          />
        </div>
        <div className="hero-grain absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-end px-4 pb-8 pt-16">
        <div className="hero-copy max-w-lg space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">Featured</p>
            {total > 1 && (
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured titles">
                {Array.from({ length: total }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Featured ${i + 1} of ${total}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-4 bg-primary" : "w-1.5 bg-foreground/35"
                    }`}
                    onClick={() => onSelectIndex?.(i)}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-[2.15rem] leading-[1.05] font-semibold tracking-tight text-balance">
              {title}
            </h1>
            {native && <p className="mt-2 text-sm text-muted-foreground">{native}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {score && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground">
                AniList {score}
              </span>
            )}
            {formatLabel(anime.format) && <span>{formatLabel(anime.format)}</span>}
            {seasonLabel(anime.season, anime.seasonYear) && (
              <span>{seasonLabel(anime.season, anime.seasonYear)}</span>
            )}
            {anime.episodes ? <span>{anime.episodes} ep</span> : null}
            <AgeBadge guide={anime.ageGuide} />
          </div>
          {anime.synopsis && (
            <p className="line-clamp-2 text-sm leading-relaxed text-foreground/85">
              {anime.synopsis.replace(/<[^>]+>/g, "")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild className="h-11 rounded-full px-5">
              <Link to={`/anime/${anime.anilistId}`}>
                <Play className="size-4 fill-current" />
                Open title
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-11 rounded-full px-5 bg-foreground/10 hover:bg-foreground/16">
              <Link to="/buddy" state={{ prefill: `tell me about ${title}` }}>
                <MessageCircle className="size-4" />
                Ask Ren
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
