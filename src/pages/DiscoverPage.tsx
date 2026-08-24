import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, SlidersHorizontal, TrendingUp, Calendar, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PosterImage } from "@/components/anime/Poster";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { persistence } from "@/lib/db/persistence";
import { animeTitle, seasonLabel } from "@/lib/media";
import type { AnimeSummary } from "@/types/anime";

type DiscoverTab = "search" | "trending" | "seasonal" | "popular";

interface Filters {
  genre?: string;
  format?: string;
  year?: number;
  minScore?: number;
}

const FORMATS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT"];
const LIVE_MIN = 2;
const DEBOUNCE_MS = 180;

function getCurrentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 2) return { season: "WINTER", year };
  if (month <= 5) return { season: "SPRING", year };
  if (month <= 8) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

function titleHaystack(a: AnimeSummary): string[] {
  return [a.title.english, a.title.romaji, a.title.native].filter(Boolean).map((t) => t!.toLowerCase());
}

function matchesQuery(a: AnimeSummary, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return false;
  const names = titleHaystack(a);
  if (names.some((n) => n.includes(needle))) return true;
  return names.some((n) => n.split(/[\s:.\-/'!]+/).some((w) => w.startsWith(needle)));
}

function rankSuggestions(items: AnimeSummary[], q: string): AnimeSummary[] {
  const needle = q.trim().toLowerCase();
  const words = (s: string) => s.split(/[\s:.\-/'!]+/).filter(Boolean);
  const score = (a: AnimeSummary) => {
    const names = titleHaystack(a);
    if (names.some((n) => n === needle)) return 0;
    if (names.some((n) => n.startsWith(needle))) return 1;
    if (names.some((n) => words(n).some((w) => w.startsWith(needle)))) return 2;
    if (names.some((n) => n.includes(needle))) return 3;
    return 4;
  };
  return [...items].sort((a, b) => score(a) - score(b) || (b.anilistScore ?? 0) - (a.anilistScore ?? 0));
}

function uniqueById(items: AnimeSummary[]): AnimeSummary[] {
  const seen = new Set<number>();
  const out: AnimeSummary[] = [];
  for (const a of items) {
    if (seen.has(a.anilistId)) continue;
    seen.add(a.anilistId);
    out.push(a);
  }
  return out;
}

function AnimePoster({ anime, onClick }: { anime: AnimeSummary; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left pressable">
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-muted poster-shadow">
        <PosterImage src={anime.coverImage} alt="" />
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug">
        {animeTitle(anime)}
      </p>
    </button>
  );
}

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<DiscoverTab>("trending");
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [suggestions, setSuggestions] = useState<AnimeSummary[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const boxRef = useRef<HTMLFormElement>(null);
  const seqRef = useRef(0);
  const seedRef = useRef<AnimeSummary[]>([]);

  const applyFilters = (anime: AnimeSummary) => {
    if (filters.genre && !anime.genres.includes(filters.genre)) return false;
    if (filters.format && anime.format !== filters.format) return false;
    if (filters.year && anime.seasonYear !== filters.year) return false;
    if (filters.minScore && (anime.anilistScore ?? 0) < filters.minScore * 10) return false;
    return true;
  };

  const filteredResults = results.filter(applyFilters);

  async function loadTab(t: DiscoverTab) {
    setTab(t);
    setLoading(true);
    setError(null);
    setResults([]);
    setSuggestOpen(false);
    try {
      let data: AnimeSummary[] = [];
      if (t === "trending") data = await animeCatalogService.getTrending(30);
      else if (t === "popular") data = await animeCatalogService.getPopular(30);
      else if (t === "seasonal") {
        const { season, year } = getCurrentSeason();
        data = await animeCatalogService.getSeasonal(season, year, 30);
      }
      setResults(data);
    } catch {
      setError("Failed to load — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function liveSearch(q: string) {
    const seq = ++seqRef.current;
    if (seedRef.current.length === 0) {
      try {
        const [popular, trending] = await Promise.all([
          animeCatalogService.getPopular(50),
          animeCatalogService.getTrending(30),
        ]);
        seedRef.current = uniqueById([...popular, ...trending]);
      } catch {
        /* seed is optional */
      }
    }
    const local = await persistence.searchCachedAnime(q, 12);
    const seeded = uniqueById([...local, ...seedRef.current]).filter((a) => matchesQuery(a, q));
    if (seq === seqRef.current && seeded.length) {
      setSuggestions(rankSuggestions(seeded, q).slice(0, 6));
      setSuggestOpen(true);
      setHighlight(0);
    }

    setTab("search");
    setLoading(true);
    setError(null);
    try {
      const remote = await animeCatalogService.search(q, 24);
      if (seq !== seqRef.current) return;
      const merged = uniqueById([...seeded, ...remote]);
      const ranked = rankSuggestions(merged, q);
      setSuggestions(ranked.slice(0, 6));
      setSuggestOpen(true);
      setHighlight(0);
      setResults(ranked.length ? ranked : remote);
    } catch {
      if (seq !== seqRef.current) return;
      if (!seeded.length) setError("Search failed — check your connection.");
      else setResults(rankSuggestions(seeded, q));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  function commitQuery(next: string, replace = true) {
    const trimmed = next.trim();
    if (trimmed) setSearchParams({ q: trimmed }, { replace });
    else setSearchParams({}, { replace });
  }

  function openAnime(anime: AnimeSummary) {
    setSuggestOpen(false);
    commitQuery(animeTitle(anime));
    navigate(`/anime/${anime.anilistId}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < LIVE_MIN) return;
    if (suggestOpen && suggestions[highlight]) {
      openAnime(suggestions[highlight]);
      return;
    }
    setSuggestOpen(false);
    commitQuery(q, false);
    void liveSearch(q);
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < LIVE_MIN) {
      setSuggestions([]);
      setSuggestOpen(false);
      if (tab === "search" && !q) void loadTab("trending");
      return;
    }
    const t = window.setTimeout(() => {
      commitQuery(q);
      void liveSearch(q);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    void Promise.all([animeCatalogService.getPopular(50), animeCatalogService.getTrending(30)]).then(
      ([popular, trending]) => {
        seedRef.current = uniqueById([...popular, ...trending]);
      },
    );
    const initial = (searchParams.get("q") ?? "").trim();
    if (initial.length >= LIVE_MIN) {
      setQuery(initial);
      return;
    }
    void loadTab("trending");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const allGenres = Array.from(new Set(results.flatMap((a) => a.genres))).sort();
  const showSuggest = suggestOpen && query.trim().length >= LIVE_MIN && suggestions.length > 0;

  return (
    <div className="space-y-4 px-4 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <h1 className="text-2xl font-semibold">Discover</h1>

      <form ref={boxRef} onSubmit={onSubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length && query.trim().length >= LIVE_MIN) setSuggestOpen(true);
          }}
          onKeyDown={(e) => {
            if (!showSuggest) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Escape") {
              setSuggestOpen(false);
            }
          }}
          placeholder="Naruto, AOT, Frieren…"
          className="h-11 pl-9 pr-10"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggest}
          aria-autocomplete="list"
        />
        {loading && query.trim().length >= LIVE_MIN && (
          <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {showSuggest && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            {suggestions.map((anime, i) => {
              const meta = [
                seasonLabel(anime.season, anime.seasonYear),
                anime.format?.replace(/_/g, " "),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={anime.anilistId} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-2.5 py-2 text-left ${
                      i === highlight ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => openAnime(anime)}
                  >
                    <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
                      <PosterImage src={anime.coverImage} alt="" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{animeTitle(anime)}</p>
                      {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "trending" as const, label: "Trending", icon: TrendingUp },
          { key: "seasonal" as const, label: "Seasonal", icon: Calendar },
          { key: "popular" as const, label: "Popular", icon: Heart },
        ].map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setQuery("");
              commitQuery("");
              loadTab(t.key);
            }}
            className="shrink-0 gap-1"
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className="shrink-0 gap-1"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      {showFilters && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={filters.genre ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value || undefined }))}
            >
              <option value="">All genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={filters.format ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value || undefined }))}
            >
              <option value="">All formats</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={filters.minScore ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, minScore: e.target.value ? Number(e.target.value) : undefined }))
              }
            >
              <option value="">Any score</option>
              <option value="8">8+</option>
              <option value="7">7+</option>
              <option value="6">6+</option>
            </select>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-3 gap-2.5">
        {filteredResults.map((anime) => (
          <AnimePoster
            key={anime.anilistId}
            anime={anime}
            onClick={() => navigate(`/anime/${anime.anilistId}`)}
          />
        ))}
      </div>

      {!loading && filteredResults.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          {query.trim().length === 1 ? "One more letter…" : "No results."}
        </p>
      )}
    </div>
  );
}
