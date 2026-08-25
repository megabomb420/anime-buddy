import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CalendarDays,
  Camera,
  Compass,
  Gem,
  MessageCircle,
  Sparkles,
  Moon,
  Heart,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgeBadge } from "@/components/AgeBadge";
import { FeaturedHero } from "@/components/anime/Hero";
import { PosterRow, SectionHeader } from "@/components/anime/PosterRow";
import { HeroSkeleton } from "@/components/anime/Skeletons";
import { AppVersionFooter } from "@/components/AppVersionFooter";
import { undoToast } from "@/lib/undo";
import { airingCountdownLabel, airingWeekdayLabel, AIRING_WEEK_MS } from "@/lib/airing";
import type { AiringInfo } from "@/types/anime";
import { persistence } from "@/lib/db/persistence";
import { recommendationService } from "@/lib/services/RecommendationService";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { db } from "@/lib/db/database";
import type { AnimeSummary } from "@/types/anime";
import type { RecommendationRecord } from "@/types/entities";

const TONIGHT_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "90 min", minutes: 90 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
  { label: "All night", minutes: 9999 },
];

/** How often Featured cycles through the trending pool. */
const FEATURED_ROTATE_MS = 10_000;
const FEATURED_POOL_SIZE = 8;

function RecommendationCard({
  rec,
  onFeedback,
}: {
  rec: RecommendationRecord;
  onFeedback?: (anilistId: number, kind: "like" | "dislike" | "already_seen" | "not_for_me") => void;
}) {
  const navigate = useNavigate();
  const [animeMap, setAnimeMap] = useState<Record<number, AnimeSummary>>({});

  useEffect(() => {
    void (async () => {
      const map: Record<number, AnimeSummary> = {};
      for (const item of rec.items) {
        const a = await animeCatalogService.getAnime(item.anilistId);
        if (a) map[item.anilistId] = a;
      }
      setAnimeMap(map);
    })();
  }, [rec.id]);

  return (
    <div className="space-y-3">
      {rec.items.map((item) => {
        const anime = animeMap[item.anilistId];
        return (
          <div key={item.anilistId} className="rounded-xl border border-border bg-card p-3">
            <button
              className="flex w-full gap-3 text-left"
              onClick={() => navigate(`/anime/${item.anilistId}`)}
            >
              {anime?.coverImage ? (
                <img src={anime.coverImage} alt="" className="h-24 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
              ) : (
                <div className="h-24 w-16 shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">
                  {anime?.title.english ?? anime?.title.romaji ?? `Anime #${item.anilistId}`}
                </p>
                <p className="text-xs text-muted-foreground">{item.reason}</p>
                <div className="flex items-center gap-1">
                  <AgeBadge guide={anime?.ageGuide} />
                  {anime?.availability && (
                    <Badge variant={anime.availability.state === "verified" ? "default" : "outline"} className="text-[10px]">
                      {anime.availability.state}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
            {onFeedback && (
              <div className="mt-2 flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onFeedback(item.anilistId, "like")}>
                  <Heart className="mr-1 h-3 w-3" /> Interested
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onFeedback(item.anilistId, "not_for_me")}>
                  Not for me
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onFeedback(item.anilistId, "already_seen")}>
                  Seen
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ library: 0, ratings: 0, favorites: 0 });
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [tonightRecs, setTonightRecs] = useState<RecommendationRecord | null>(null);
  const [hiddenGemRecs, setHiddenGemRecs] = useState<RecommendationRecord | null>(null);
  const [surpriseRecs, setSurpriseRecs] = useState<RecommendationRecord | null>(null);
  const [continueWatching, setContinueWatching] = useState<Array<{ anime: AnimeSummary; progress: number }>>([]);
  const [airing, setAiring] = useState<Record<number, AiringInfo>>({});
  const [thisWeek, setThisWeek] = useState<Array<{ anime: AnimeSummary; info: AiringInfo }>>([]);
  const [loadingTonight, setLoadingTonight] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [trending, setTrending] = useState<AnimeSummary[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroEpoch, setHeroEpoch] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [forYou, setForYou] = useState<AnimeSummary[]>([]);
  const [forYouReasons, setForYouReasons] = useState<Record<number, string>>({});
  const [forYouKicker, setForYouKicker] = useState("From your library");
  const [forYouEmpty, setForYouEmpty] = useState<"no-taste" | "no-matches" | null>(null);
  const [forYouLoading, setForYouLoading] = useState(true);
  const forYouExcludedRef = useRef<Set<number>>(new Set());
  const poolLenRef = useRef(0);

  const featuredPool = useMemo(
    () => trending.slice(0, FEATURED_POOL_SIZE),
    [trending],
  );
  poolLenRef.current = featuredPool.length;
  const hero =
    featuredPool.length > 0
      ? featuredPool[heroIndex % featuredPool.length] ?? null
      : null;

  useEffect(() => {
    void (async () => {
      const [library, settings, favs, trend] = await Promise.all([
        persistence.getLibrary(),
        persistence.getSettings(),
        db.favoriteAnime.toArray(),
        animeCatalogService.getTrending(18).catch(() => [] as AnimeSummary[]),
      ]);
      const ratings = await persistence.getTasteSignals();
      setCounts({
        library: library.length,
        ratings: ratings.length,
        favorites: favs.length,
      });
      setOnboardingDone(settings.onboardingCompleted);
      setTrending(trend);
      setHeroIndex(0);
      setCatalogLoading(false);

      const watching = library.filter((e) => e.status === "watching");
      const cw: Array<{ anime: AnimeSummary; progress: number }> = [];
      for (const entry of watching.slice(0, 5)) {
        const anime = await animeCatalogService.getAnime(entry.anilistId);
        if (anime) cw.push({ anime, progress: entry.progress });
      }
      setContinueWatching(cw);

      // "This week" rail: next episodes of anything on the watching /
      // plan-to-watch list airing within the next 7 days.
      const airingIds = library
        .filter((e) => e.status === "watching" || e.status === "plan_to_watch")
        .map((e) => e.anilistId);
      if (airingIds.length > 0) {
        const airingMap = await animeCatalogService.getAiringFor(airingIds);
        setAiring(Object.fromEntries(airingMap));
        const soon = [...airingMap.entries()]
          .filter(([, a]) => a.airingAt <= Date.now() + AIRING_WEEK_MS)
          .sort((x, y) => x[1].airingAt - y[1].airingAt)
          .slice(0, 12);
        const week: Array<{ anime: AnimeSummary; info: AiringInfo }> = [];
        for (const [id, info] of soon) {
          const known = cw.find((c) => c.anime.anilistId === id)?.anime;
          const anime = known ?? (await animeCatalogService.getAnime(id));
          if (anime) week.push({ anime, info });
        }
        setThisWeek(week);
      }
    })();
  }, []);

  async function loadForYou(excludeIds?: Set<number>) {
    setForYouLoading(true);
    try {
      const result = await recommendationService.forYou(12, excludeIds ? { excludeIds } : undefined);
      setForYou(result.items);
      setForYouReasons(result.reasons);
      setForYouKicker(result.kicker);
      setForYouEmpty(result.empty ?? null);
      return result;
    } catch {
      setForYouEmpty("no-matches");
      return null;
    } finally {
      setForYouLoading(false);
    }
  }

  useEffect(() => {
    void loadForYou();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Refresh: cycle to the next-best titles; wrap around when the pool runs out. */
  async function refreshForYou() {
    const excluded = forYouExcludedRef.current;
    for (const a of forYou) excluded.add(a.anilistId);
    const result = await loadForYou(excluded);
    if (result && result.items.length === 0 && excluded.size > 0) {
      excluded.clear();
      await loadForYou();
    }
  }

  async function forYouFeedback(anilistId: number, kind: "like" | "not_for_me") {
    await recommendationService.recordFeedback(anilistId, kind);
    if (kind === "not_for_me") {
      forYouExcludedRef.current.add(anilistId);
      setForYou((items) => items.filter((a) => a.anilistId !== anilistId));
      undoToast("Hidden from recommendations", async () => {
        await persistence.unhideAnime(anilistId);
        forYouExcludedRef.current.delete(anilistId);
      });
    }
  }

  useEffect(() => {
    if (featuredPool.length < 2) return;
    if (typeof window === "undefined") return;

    let timer: number | undefined;

    const clear = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const tick = () => {
      const n = poolLenRef.current;
      if (n < 2) return;
      setHeroIndex((i) => (i + 1) % n);
    };

    const start = () => {
      clear();
      timer = window.setInterval(tick, FEATURED_ROTATE_MS);
    };

    const onVisibility = () => {
      if (document.hidden) clear();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [featuredPool.length, heroEpoch]);

  /** Manual hero pick (dots or swipe) — also restarts the auto-rotate timer. */
  function selectHero(i: number) {
    setHeroIndex(i);
    setHeroEpoch((e) => e + 1);
  }

  async function loadTonight(minutes: number) {
    setSelectedMinutes(minutes);
    setLoadingTonight(true);
    try {
      const rec = await recommendationService.recommend({
        query: minutes < 9999 ? `Something I can finish in about ${minutes} minutes` : "Something binge-worthy",
        context: "tonight",
        requireCrunchyroll: false,
        timeBudgetMinutes: minutes,
      });
      setTonightRecs(rec);
    } catch {
      /* optional */
    } finally {
      setLoadingTonight(false);
    }
  }

  async function loadHiddenGem() {
    try {
      const rec = await recommendationService.recommend({
        query: "Hidden gem: high quality but not too popular",
        context: "hidden-gem",
      });
      setHiddenGemRecs(rec);
    } catch {
      /* optional */
    }
  }

  async function loadSurprise() {
    try {
      const rec = await recommendationService.recommend({
        query: "Surprise me with something outside my usual taste",
        context: "surprise",
      });
      setSurpriseRecs(rec);
    } catch {
      /* optional */
    }
  }

  async function recordFeedback(
    anilistId: number,
    feedback: "like" | "dislike" | "already_seen" | "not_for_me",
  ) {
    await recommendationService.recordFeedback(anilistId, feedback);
  }

  return (
    <div className="pb-8">
      {catalogLoading ? (
        <HeroSkeleton />
      ) : hero ? (
        <FeaturedHero
          key={hero.anilistId}
          anime={hero}
          index={heroIndex % Math.max(featuredPool.length, 1)}
          total={featuredPool.length}
          onSelectIndex={selectHero}
        />
      ) : null}

      <section className="mt-8">
        <SectionHeader title="Trending now" kicker="Live catalog" href="/discover" />
        <PosterRow
          items={trending.filter((a) => a.anilistId !== hero?.anilistId)}
          loading={catalogLoading}
          size="lg"
        />
      </section>

      <section className="mt-8">
        <SectionHeader
          title="For you"
          kicker={forYouKicker}
          href="/discover"
          action={
            forYou.length > 0 ? (
              <button
                type="button"
                aria-label="Refresh For you"
                onClick={() => void refreshForYou()}
                disabled={forYouLoading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={forYouLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </button>
            ) : undefined
          }
        />
        {forYouLoading || forYou.length > 0 ? (
          <PosterRow
            items={forYou}
            loading={forYouLoading}
            size="lg"
            reasons={forYouReasons}
            onFeedback={(id, kind) => void forYouFeedback(id, kind)}
          />
        ) : (
          <p className="px-4 text-sm text-muted-foreground">
            {forYouEmpty === "no-taste"
              ? "Rate or log a few titles. This row is scored from your library — AniList supplies the names."
              : "Nothing ranked yet. Rate a title in Library or Discover."}
          </p>
        )}
      </section>

      <div className="mx-auto max-w-md space-y-8 px-4 pt-8">
        {onboardingDone === false && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-medium">Build your taste</h2>
            <p className="text-sm text-muted-foreground">
              Rate some anime, pick favorites, or just start talking — no questionnaire.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to="/discover">Rate some anime</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/buddy">Just start talking</Link>
              </Button>
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Camera, label: "Scan", to: "/scan" },
            { icon: Compass, label: "Discover", to: "/discover" },
            { icon: MessageCircle, label: "Ask Buddy", to: "/buddy" },
            { icon: Sparkles, label: "Surprise Me", action: loadSurprise },
          ].map((item) => (
            <Button
              key={item.label}
              variant="outline"
              className="flex h-auto flex-col gap-1 py-3"
              asChild={!!item.to}
              onClick={item.action}
            >
              {item.to ? (
                <Link to={item.to}>
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs">{item.label}</span>
                </Link>
              ) : (
                <>
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs">{item.label}</span>
                </>
              )}
            </Button>
          ))}
        </section>

        {continueWatching.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Continue Watching</h2>
              <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
                <Link to="/library">View all</Link>
              </Button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {continueWatching.map(({ anime, progress }) => (
                <button
                  key={anime.anilistId}
                  className="flex w-24 shrink-0 flex-col gap-1 text-left"
                  onClick={() => navigate(`/anime/${anime.anilistId}`)}
                >
                  {anime.coverImage ? (
                    <img src={anime.coverImage} alt="" className="h-32 w-24 rounded-md object-cover" loading="lazy" />
                  ) : (
                    <div className="h-32 w-24 rounded-md bg-muted" />
                  )}
                  <span className="text-[10px] text-muted-foreground">Ep {progress}</span>
                  {airing[anime.anilistId] && (
                    <span className="text-[10px] font-medium text-primary">
                      Next: Ep {airing[anime.anilistId].episode} ·{" "}
                      {airingCountdownLabel(airing[anime.anilistId].airingAt)}
                    </span>
                  )}
                  <span className="line-clamp-2 text-xs font-medium">{anime.title.english ?? anime.title.romaji}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {thisWeek.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h2 className="font-medium">This week</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {thisWeek.map(({ anime, info }) => (
                <button
                  key={anime.anilistId}
                  className="flex w-24 shrink-0 flex-col gap-1 text-left"
                  onClick={() => navigate(`/anime/${anime.anilistId}`)}
                >
                  {anime.coverImage ? (
                    <img src={anime.coverImage} alt="" className="h-32 w-24 rounded-md object-cover" loading="lazy" />
                  ) : (
                    <div className="h-32 w-24 rounded-md bg-muted" />
                  )}
                  <span className="text-[10px] font-medium text-primary">
                    Ep {info.episode} · {airingWeekdayLabel(info.airingAt)}
                  </span>
                  <span className="line-clamp-2 text-xs font-medium">{anime.title.english ?? anime.title.romaji}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Tonight</h2>
          </div>
          <p className="text-sm text-muted-foreground">How much time do you have?</p>
          <div className="flex flex-wrap gap-2">
            {TONIGHT_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                variant={selectedMinutes === opt.minutes ? "default" : "outline"}
                size="sm"
                onClick={() => loadTonight(opt.minutes)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {loadingTonight && <p className="text-sm text-muted-foreground">Finding something perfect…</p>}
          {tonightRecs && <RecommendationCard rec={tonightRecs} onFeedback={recordFeedback} />}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Hidden Gem</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={loadHiddenGem}>
              {hiddenGemRecs ? "Refresh" : "Find one"}
            </Button>
          </div>
          {hiddenGemRecs ? (
            <RecommendationCard rec={hiddenGemRecs} onFeedback={recordFeedback} />
          ) : (
            <p className="text-sm text-muted-foreground">Discover great anime that flew under the radar.</p>
          )}
        </section>

        {surpriseRecs && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-medium">Surprise Me</h2>
            </div>
            <RecommendationCard rec={surpriseRecs} onFeedback={recordFeedback} />
          </section>
        )}

        <section className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: "Library", value: counts.library, to: "/library" },
            { label: "Taste signals", value: counts.ratings },
            { label: "Favorites", value: counts.favorites, to: "/profile" },
          ].map((s) => (
            <Button
              key={s.label}
              variant="outline"
              className="flex h-auto flex-col gap-1 py-3"
              asChild={!!s.to}
            >
              {s.to ? (
                <Link to={s.to}>
                  <div className="text-xl font-semibold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </Link>
              ) : (
                <>
                  <div className="text-xl font-semibold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </>
              )}
            </Button>
          ))}
        </section>
        <AppVersionFooter />
      </div>
    </div>
  );
}
