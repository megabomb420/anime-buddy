import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Heart, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { persistence } from "@/lib/db/persistence";
import { db } from "@/lib/db/database";
import { providers } from "@/lib/providers";
import type { CharacterSummary } from "@/types/anime";

export default function CharactersPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [tab, setTab] = useState<"search" | "favorites">("search");

  useEffect(() => {
    void (async () => {
      const favs = await db.favoriteCharacters.toArray();
      setFavorites(new Set(favs.map((f) => f.characterId)));
      const r = await db.characterRatings.toArray();
      const map: Record<number, number> = {};
      for (const x of r) map[x.characterId] = x.score;
      setRatings(map);
    })();
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      // Search anime by query, then fetch characters from top results
      const animeResults = await animeCatalogService.search(q, 5);
      const chars: CharacterSummary[] = [];
      for (const a of animeResults) {
        const c = await providers.catalog.getCharacters(a.anilistId);
        chars.push(...c);
      }
      // Deduplicate by character id
      const seen = new Set<number>();
      setCharacters(chars.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      }));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite(characterId: number) {
    if (favorites.has(characterId)) {
      await db.favoriteCharacters.delete(characterId);
      setFavorites((prev) => {
        const next = new Set(prev);
        next.delete(characterId);
        return next;
      });
    } else {
      await persistence.addFavoriteCharacter(characterId);
      setFavorites((prev) => new Set(prev).add(characterId));
    }
  }

  const displayedCharacters = tab === "favorites"
    ? characters.filter((c) => favorites.has(c.id))
    : characters;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Characters</h1>

      <div className="flex gap-2">
        <Button variant={tab === "search" ? "default" : "outline"} size="sm" onClick={() => setTab("search")}>
          Search
        </Button>
        <Button variant={tab === "favorites" ? "default" : "outline"} size="sm" onClick={() => setTab("favorites")}>
          My Characters ({favorites.size})
        </Button>
      </div>

      {tab === "search" && (
        <form onSubmit={runSearch} className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search characters via anime…"
            className="pl-9"
          />
        </form>
      )}

      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}

      <div className="grid grid-cols-3 gap-3">
        {displayedCharacters.map((c) => (
          <div key={c.id} className="flex flex-col gap-1">
            <button className="relative" onClick={() => navigate(`/character/${c.id}`)}>
              {c.image ? (
                <img src={c.image} alt="" className="h-32 w-full rounded-md object-cover" loading="lazy" />
              ) : (
                <div className="h-32 w-full rounded-md bg-muted" />
              )}
            </button>
            <div className="flex items-center justify-between gap-1">
              <button onClick={() => navigate(`/character/${c.id}`)} className="min-w-0 flex-1 text-left">
                <span className="line-clamp-1 text-xs font-medium">{c.name}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 shrink-0 ${favorites.has(c.id) ? "text-red-500" : ""}`}
                onClick={() => toggleFavorite(c.id)}
              >
                <Heart className={`h-3 w-3 ${favorites.has(c.id) ? "fill-current" : ""}`} />
              </Button>
            </div>
            {ratings[c.id] && (
              <div className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                <Star className="h-3 w-3" />
                {ratings[c.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && displayedCharacters.length === 0 && tab === "search" && query.trim() && (
        <p className="text-sm text-muted-foreground">No characters found.</p>
      )}
      {!loading && displayedCharacters.length === 0 && tab === "favorites" && (
        <p className="text-sm text-muted-foreground">No favorite characters yet.</p>
      )}
    </div>
  );
}
