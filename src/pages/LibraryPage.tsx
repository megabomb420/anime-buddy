import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Heart, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          <p className="truncate font-medium">{anime?.title.english ?? anime?.title.romaji ?? `Anime #${entry.anilistId}`}</p>
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

export default function LibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [animeMap, setAnimeMap] = useState<Record<number, AnimeSummary>>({});
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [airing, setAiring] = useState<Record<number, AiringInfo>>({});
  const [activeTab, setActiveTab] = useState<LibraryStatus | "all">("all");
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const all = await persistence.getLibrary();
      setEntries(all);
      const favs = await db.favoriteAnime.toArray();
      setFavorites(new Set(favs.map((f) => f.anilistId)));

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

  const displayed = activeTab === "all" ? entries : entries.filter((e) => e.status === activeTab);

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

      {displayed.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {activeTab === "all"
            ? "Your library is empty. Find something in Discover and it'll show up here."
            : "No anime in this list."}
        </p>
      )}

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

      {/* Favorites section */}
      {activeTab === "all" && favorites.size > 0 && (
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
