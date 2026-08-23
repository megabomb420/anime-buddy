import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  BarChart3,
  Download,
  Library,
  Settings,
  Star,
  Upload,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { persistence } from "@/lib/db/persistence";
import { db } from "@/lib/db/database";
import { tasteService } from "@/lib/services/TasteService";
import type { ContentVisibility, Settings as SettingsType, TasteProfile } from "@/types/entities";

interface Stats {
  completed: number;
  episodesWatched: number;
  totalHours: number;
  avgRating: number | null;
  favorites: number;
  favoriteChars: number;
  dropped: number;
  completionRate: number;
}

export default function ProfilePage() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [taste, setTaste] = useState<TasteProfile | null>(null);
  const [exported, setExported] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [genreDistribution, setGenreDistribution] = useState<Record<string, number>>({});
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const [s, t, library, ratings, favs, charFavs] = await Promise.all([
        persistence.getSettings(),
        persistence.getTasteProfile(),
        persistence.getLibrary(),
        db.animeRatings.toArray(),
        db.favoriteAnime.toArray(),
        db.favoriteCharacters.toArray(),
      ]);
      setSettings(s);
      setTaste(t);

      const completed = library.filter((e) => e.status === "completed").length;
      const dropped = library.filter((e) => e.status === "dropped").length;
      const episodesWatched = library.reduce((sum, e) => sum + (e.progress || 0), 0);
      const totalHours = Math.round((episodesWatched * 24) / 60);
      const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null;
      const total = library.length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      setStats({
        completed,
        episodesWatched,
        totalHours,
        avgRating,
        favorites: favs.length,
        favoriteChars: charFavs.length,
        dropped,
        completionRate,
      });

      // Genre distribution from taste signals
      const signals = await persistence.getTasteSignals();
      const genres: Record<string, number> = {};
      for (const sig of signals) {
        if (sig.kind === "genre") {
          genres[sig.value] = (genres[sig.value] || 0) + sig.weight;
        }
      }
      setGenreDistribution(genres);

      // Rating distribution
      const dist: Record<number, number> = {};
      for (const r of ratings) {
        dist[r.score] = (dist[r.score] || 0) + 1;
      }
      setRatingDistribution(dist);
    })();
  }, []);

  async function setVisibility(value: ContentVisibility) {
    setSettings(await persistence.updateSettings({ contentVisibility: value }));
  }

  async function exportData() {
    const dump = await persistence.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anime-buddy-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  }

  async function importData(file: File) {
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      await persistence.importAll(dump);
      window.location.reload();
    } catch {
      alert("Import failed — invalid file format.");
    }
  }

  async function rebuildTaste() {
    await tasteService.rebuildTasteProfile(false);
    setTaste(await persistence.getTasteProfile());
  }

  if (!settings) return null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Profile</h1>

      {/* Stats grid */}
      {stats && (
        <section className="space-y-3">
          <h2 className="font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Your Stats
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.completed}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.episodesWatched}</div>
              <div className="text-xs text-muted-foreground">Episodes</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.totalHours}h</div>
              <div className="text-xs text-muted-foreground">Estimated</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.avgRating?.toFixed(1) ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Avg Rating</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.favorites}</div>
              <div className="text-xs text-muted-foreground">Favorites</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xl font-semibold">{stats.completionRate}%</div>
              <div className="text-xs text-muted-foreground">Completion</div>
            </div>
          </div>
        </section>
      )}

      {/* Taste DNA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium flex items-center gap-2">
            <Star className="h-4 w-4" /> Taste DNA
          </h2>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={rebuildTaste}>
            Rebuild
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          {taste?.summary ? (
            <p className="text-sm">{taste.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {Object.keys(taste?.stats ?? {}).length > 0
                ? `${Object.keys(taste!.stats).length} taste signals recorded.`
                : "No taste data yet — rate anime, pick favorites, or talk to Buddy."}
            </p>
          )}
        </div>
        {Object.keys(genreDistribution).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(genreDistribution)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([genre, weight]) => (
                <Badge key={genre} variant={weight > 0 ? "default" : "outline"} className="text-xs">
                  {genre} {weight > 0 ? "+" : ""}{weight.toFixed(1)}
                </Badge>
              ))}
          </div>
        )}
      </section>

      {/* Rating Distribution */}
      {Object.keys(ratingDistribution).length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Rating Distribution</h2>
          <div className="space-y-1">
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => {
              const count = ratingDistribution[score] || 0;
              const max = Math.max(...Object.values(ratingDistribution));
              return (
                <div key={score} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right">{score}</span>
                  <div className="flex-1 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-6 text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Content visibility */}
      <section className="space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <Settings className="h-4 w-4" /> Content visibility
        </h2>
        <div className="space-y-2">
          <Label htmlFor="visibility">Age-appropriate browsing</Label>
          <Select value={settings.contentVisibility} onValueChange={(v) => void setVisibility(v as ContentVisibility)}>
            <SelectTrigger id="visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="show_all">Show all</SelectItem>
              <SelectItem value="hide_18_plus">Hide 18+</SelectItem>
              <SelectItem value="family">Family profile (max age)</SelectItem>
            </SelectContent>
          </Select>
          {settings.contentVisibility === "family" && (
            <div className="space-y-1">
              <Label className="text-xs">Max age</Label>
              <input
                type="number"
                min={0}
                max={21}
                value={settings.maxAge ?? 12}
                onChange={(e) =>
                  persistence.updateSettings({ maxAge: Number(e.target.value) })
                }
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Region: {settings.region} · Age guides show their source; MAL-derived labels are never
            presented as official Irish classifications.
          </p>
        </div>
      </section>

      {/* Quick links */}
      <section className="space-y-3">
        <h2 className="font-medium">Quick Links</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/library">
              <Library className="mr-1 h-4 w-4" /> Library
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/characters">
              <User className="mr-1 h-4 w-4" /> Characters
            </Link>
          </Button>
        </div>
      </section>

      {/* Data export/import */}
      <section className="space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <Download className="h-4 w-4" /> Your data
        </h2>
        <p className="text-xs text-muted-foreground">
          Everything lives in this browser (IndexedDB). No account, no cloud copy.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exportData()}>
            {exported ? "Exported ✓" : "Export all data"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importData(file);
            }}
          />
        </div>
      </section>
    </div>
  );
}
