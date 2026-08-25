import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Heart, LayoutGrid, List, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgeBadge } from "@/components/AgeBadge";
import { persistence } from "@/lib/db/persistence";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { airingCountdownLabel } from "@/lib/airing";
import { db } from "@/lib/db/database";
import type { AiringInfo, AnimeSummary } from "@/types/anime";
import type { LibraryEntry, LibraryStatus } from "@/types/entities";

const SECTIONS: Array<{ status: LibraryStatus; label: string }> = [
  { status: "watching", label: "Watching" },
  { status: "plan_to_watch", label: "Want to Watch" },
  { status: "completed", label: "Completed" },
  { status: "on_hold", label: "On Hold" },
  { status: "dropped", label: "Dropped" },
];

type SortKey = "updated" | "title" | "rating" | "progress";
type ViewMode = "list" | "grid";

const PREFS_KEY = "anime-buddy:library-prefs";

function loadPrefs(): { sortBy: SortKey; view: ViewMode } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sortBy?: SortKey; view?: ViewMode };
      return {
        sortBy: parsed.sortBy ?? "updated",
        view: parsed.view === "grid" ? "grid" : "list",
      };
    }
  } catch {
    /* ignore */
  }
  return { sortBy: "updated", view: "list" };
}

function entryTitle(entry: LibraryEntry, anime?: AnimeSummary): string {
  return anime?.title.english ?? anime?.title.romaji ?? `Anime #${entry.anilistId}`;
}

function LibraryItem({
  entry,
  anime,
  isFav,
  airing,
}: {
  entry: LibraryEntry;
  anime?: AnimeSummary;
  isFav: boolean;
  airing?: AiringInfo;
}) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(entry.progress);

  async function changeProgress(delta: number) {
    const next = Math.max(0, progress + delta);
    setProgress(next);
    await persistence.setProgress(entry.anilistId, next);
    await persistence.setLibraryStatus(entry.anilistId, entry.status, next);
  }

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <button onClick={() => navigate(`/anime/${entry.anilistId}`)} className="shrink-0">
        {anime?.coverImage ? (
          <img src={anime.coverImage} alt="" className="h-24 w-16 rounded-md object-cover" loading="lazy" />
        ) : (
          <div className="h-24 w-16 rounded-md bg-muted" />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <button onClick={() => navigate(`/anime/${entry.anilistId}`)} className="block w-full text-left">
          <p className="truncate font-medium">{entryTitle(entry, anime)}</p>
          <div className="flex items-center gap-1 pt-0.5">
            <AgeBadge guide={anime?.ageGuide} />
            {isFav && <Heart className="h-3 w-3 fill-red-500 text-red-500" />}
          </div>
        </button>

        {/* Progress controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Progress</span>
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => changeProgress(-1)}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="min-w-[3ch] text-center text-xs font-medium">
            {progress}/{anime?.episodes ?? "?"}
          </span>
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => changeProgress(1)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {entry.status === "watching" && airing && (
          <p className="text-[11px] font-medium text-primary">
            Next: Ep {airing.episode} · {airingCountdownLabel(airing.airingAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function GridItem({
  entry,
  anime,
  isFav,
  rating,
}: {
  entry: LibraryEntry;
  anime?: AnimeSummary;
  isFav: boolean;
  rating?: number;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/anime/${entry.anilistId}`)}
      className="text-left pressable"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted poster-shadow">
        {anime?.coverImage ? (
          <img src={anime.coverImage} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
        <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium">
          {entry.progress}/{anime?.episodes ?? "?"}
        </span>
        {isFav && (
          <Heart className="absolute right-1 top-1 h-3.5 w-3.5 fill-red-500 text-red-500 drop-shadow" />
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug">{entryTitle(entry, anime)}</p>
      {rating !== undefined && <p className="text-[10px] text-muted-foreground">★ {rating}</p>}
    </button>
  );
}

export default function LibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [animeMap, setAnimeMap] = useState<Record<number, AnimeSummary>>({});
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [airing, setAiring] = useState<Record<number, AiringInfo>>({});
  const [activeTab, setActiveTab] = useState<LibraryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [{ sortBy, view }, setPrefs] = useState(loadPrefs);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, view }));
    } catch {
      /* ignore */
    }
  }, [sortBy, view]);

  useEffect(() => {
    void (async () => {
      const all = await persistence.getLibrary();
      setEntries(all);
      const favs = await db.favoriteAnime.toArray();
      setFavorites(new Set(favs.map((f) => f.anilistId)));
      const ratingRows = await db.animeRatings.toArray();
      const rMap: Record<number, number> = {};
      for (const r of ratingRows) rMap[r.anilistId] = r.score;
      setRatings(rMap);

      const map: Record<number, AnimeSummary> = {};
      for (const e of all) {
        const a = await animeCatalogService.getAnime(e.anilistId);
        if (a) map[e.anilistId] = a;
      }
      setAnimeMap(map);

      const watchingIds = all.filter((e) => e.status === "watching").map((e) => e.anilistId);
      if (watchingIds.length > 0) {
        const airingMap = await animeCatalogService.getAiringFor(watchingIds);
        setAiring(Object.fromEntries(airingMap));
      }
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (activeTab === "all" ? entries : entries.filter((e) => e.status === activeTab))
    .filter((e) => {
      if (!q) return true;
      const a = animeMap[e.anilistId];
      const names = [a?.title.english, a?.title.romaji, a?.title.native]
        .filter(Boolean)
        .map((t) => t!.toLowerCase());
      return names.some((n) => n.includes(q));
    });
  const displayed = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "title":
        return entryTitle(a, animeMap[a.anilistId]).localeCompare(
          entryTitle(b, animeMap[b.anilistId]),
        );
      case "rating":
        return (ratings[b.anilistId] ?? -1) - (ratings[a.anilistId] ?? -1);
      case "progress":
        return b.progress - a.progress;
      default:
        return b.updatedAt - a.updatedAt;
    }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My Anime</h1>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button variant={activeTab === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("all")}>
          All ({entries.length})
        </Button>
        {SECTIONS.map(({ status, label }) => {
          const count = entries.filter((e) => e.status === status).length;
          return (
            <Button
              key={status}
              variant={activeTab === status ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(status)}
            >
              {label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Filter / sort / view */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter my list…"
            className="h-9 pl-8 text-sm"
            autoComplete="off"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setPrefs((p) => ({ ...p, sortBy: e.target.value as SortKey }))}
          className="h-9 shrink-0 rounded-md border border-border bg-background px-2 text-xs"
          aria-label="Sort library"
        >
          <option value="updated">Recent</option>
          <option value="title">Title</option>
          <option value="rating">My rating</option>
          <option value="progress">Progress</option>
        </select>
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setPrefs((p) => ({ ...p, view: "list" }))}
          aria-label="List view"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={view === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setPrefs((p) => ({ ...p, view: "grid" }))}
          aria-label="Grid view"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>

      {displayed.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {q
            ? `Nothing in your library matches “${query.trim()}”.`
            : activeTab === "all"
              ? "Your library is empty. Find something in Discover and it'll show up here."
              : "No anime in this list."}
        </p>
      )}

      {view === "grid" ? (
        <div className="grid grid-cols-3 gap-2.5">
          {displayed.map((e) => (
            <GridItem
              key={e.anilistId}
              entry={e}
              anime={animeMap[e.anilistId]}
              isFav={favorites.has(e.anilistId)}
              rating={ratings[e.anilistId]}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((e) => (
            <LibraryItem
              key={e.anilistId}
              entry={e}
              anime={animeMap[e.anilistId]}
              isFav={favorites.has(e.anilistId)}
              airing={airing[e.anilistId]}
            />
          ))}
        </div>
      )}

      {/* Favorites section */}
      {activeTab === "all" && !q && favorites.size > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Favorites</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {Array.from(favorites).map((id) => {
              const anime = animeMap[id];
              if (!anime) return null;
              return (
                <button
                  key={id}
                  className="flex w-20 shrink-0 flex-col gap-1 text-left"
                  onClick={() => navigate(`/anime/${id}`)}
                >
                  {anime.coverImage ? (
                    <img src={anime.coverImage} alt="" className="h-28 w-20 rounded-md object-cover" loading="lazy" />
                  ) : (
                    <div className="h-28 w-20 rounded-md bg-muted" />
                  )}
                  <span className="line-clamp-2 text-[10px] font-medium">{anime.title.english ?? anime.title.romaji}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
