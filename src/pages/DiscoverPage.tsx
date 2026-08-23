import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Search, SlidersHorizontal, TrendingUp, Calendar, Heart } from "lucide-react";
import { AgeBadge } from "@/components/AgeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import type { AnimeSummary } from "@/types/anime";

type DiscoverTab = "search" | "trending" | "seasonal" | "popular";

interface Filters {
  genre?: string;
  format?: string;
  year?: number;
  minScore?: number;
}

const FORMATS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT"];

function getCurrentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 2) return { season: "WINTER", year };
  if (month <= 5) return { season: "SPRING", year };
  if (month <= 8) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

function AnimeCard({ anime, onClick }: { anime: AnimeSummary; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex gap-3 rounded-xl border border-border bg-card p-3 text-left">
      {anime.coverImage ? (
        <img src={anime.coverImage} alt="" className="h-24 w-16 shrink-0 rounded-md object-cover" loading="lazy" />
      ) : (
        <div className="h-24 w-16 shrink-0 rounded-md bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-medium">{anime.title.english ?? anime.title.romaji}</p>
          <AgeBadge guide={anime.ageGuide} />
        </div>
        <p className="text-xs text-muted-foreground">
          {anime.format ?? "Anime"}
          {anime.seasonYear ? ` · ${anime.seasonYear}` : ""}
          {anime.anilistScore ? ` · AniList ${anime.anilistScore / 10}` : ""}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{anime.genres.join(" · ")}</p>
      </div>
    </button>
  );
}

export default function DiscoverPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DiscoverTab>("trending");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});

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

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setTab("search");
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      setResults(await animeCatalogService.search(q, 30));
    } catch {
      setError("Search failed — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTab("trending");
  }, []);

  const allGenres = Array.from(new Set(results.flatMap((a) => a.genres))).sort();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Discover</h1>

      <form onSubmit={runSearch} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anime on AniList…"
          className="pl-9"
        />
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
            onClick={() => loadTab(t.key)}
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
              onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value ? Number(e.target.value) : undefined }))}
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

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="space-y-3">
        {filteredResults.map((anime) => (
          <li key={anime.anilistId}>
            <AnimeCard anime={anime} onClick={() => navigate(`/anime/${anime.anilistId}`)} />
          </li>
        ))}
      </ul>

      {!loading && filteredResults.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No results.</p>
      )}
    </div>
  );
}
