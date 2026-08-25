import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  BarChart3,
  Download,
  EyeOff,
  Library,
  Settings,
  Share2,
  Star,
  Upload,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { VisionGatewayCard } from "@/components/VisionGatewayCard";
import { persistence } from "@/lib/db/persistence";
import { db } from "@/lib/db/database";
import { toast } from "sonner";
import { applyAniListImport } from "@/lib/anilist-import-apply";
import { fetchAniListList, type AniListImportPreview } from "@/lib/anilist-import";
import { tasteService } from "@/lib/services/TasteService";
import { shareTasteCard } from "@/lib/taste-card";
import type {
  ContentVisibility,
  Settings as SettingsType,
  SpoilerLevel,
  TasteProfile,
} from "@/types/entities";
import { APP_BUILT_AT, APP_COMMIT, APP_VERSION, checkForUpdate } from "@/lib/app-version";
import type { VersionCheck } from "@/lib/app-version";

const GenreChart = lazy(() =>
  import("@/components/profile/ProfileCharts").then((m) => ({ default: m.GenreChart })),
);
const ScoreCompareChart = lazy(() =>
  import("@/components/profile/ProfileCharts").then((m) => ({ default: m.ScoreCompareChart })),
);

function ChartSkeleton({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-border bg-card ${className}`}
      aria-hidden
    />
  );
}

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
  const [hiddenList, setHiddenList] = useState<Array<{ anilistId: number; title: string }>>([]);
  const [scoreCompare, setScoreCompare] = useState<Array<{ title: string; yours: number; anilist: number }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [versionCheck, setVersionCheck] = useState<VersionCheck | null>(null);
  const [rebuildingTaste, setRebuildingTaste] = useState(false);
  const [importName, setImportName] = useState("");
  const [importPreview, setImportPreview] = useState<AniListImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [sharingCard, setSharingCard] = useState(false);

  async function shareTaste() {
    if (sharingCard) return;
    setSharingCard(true);
    try {
      const result = await shareTasteCard({
        summary: taste?.summary ?? null,
        genres: Object.entries(genreDistribution).map(([genre, weight]) => ({ genre, weight })),
        stats: stats
          ? { completed: stats.completed, avgRating: stats.avgRating, totalHours: stats.totalHours }
          : null,
      });
      toast(result === "shared" ? "Taste DNA card shared" : "Taste DNA card saved as PNG");
    } catch (err) {
      // User cancelling the share sheet throws an AbortError — stay quiet for that.
      if (!(err instanceof Error && err.name === "AbortError")) {
        toast.error("Could not create the card.");
      }
    } finally {
      setSharingCard(false);
    }
  }

  async function previewImport() {
    if (importBusy) return;
    setImportBusy(true);
    setImportError(null);
    setImportPreview(null);
    try {
      setImportPreview(await fetchAniListList(importName));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  async function applyImport() {
    if (!importPreview || importBusy) return;
    setImportBusy(true);
    setImportError(null);
    try {
      await applyAniListImport(importPreview, (done, total) => setImportProgress({ done, total }));
      toast(`Imported ${importPreview.entries.length} titles from AniList`);
      setImportPreview(null);
      setImportName("");
    } catch {
      setImportError("Import failed partway — re-run it, imported titles are kept.");
    } finally {
      setImportBusy(false);
      setImportProgress(null);
    }
  }

  useEffect(() => {
    void checkForUpdate().then(setVersionCheck);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#vision") return;
    requestAnimationFrame(() => {
      document.getElementById("vision")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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

      const signals = await persistence.getTasteSignals();
      const genres: Record<string, number> = {};
      for (const sig of signals) {
        if (sig.kind === "genre") {
          genres[sig.value] = (genres[sig.value] || 0) + sig.weight;
        }
      }
      setGenreDistribution(genres);

      const dist: Record<number, number> = {};
      for (const r of ratings) {
        dist[r.score] = (dist[r.score] || 0) + 1;
      }
      setRatingDistribution(dist);

      const hidden = await persistence.getHiddenAnime().catch(() => []);
      const resolved: Array<{ anilistId: number; title: string }> = [];
      for (const h of hidden) {
        const cached = await persistence.getCachedAnime(h.anilistId);
        resolved.push({
          anilistId: h.anilistId,
          title: cached?.title.english ?? cached?.title.romaji ?? `Anime #${h.anilistId}`,
        });
      }
      setHiddenList(resolved);

      const compare: Array<{ title: string; yours: number; anilist: number }> = [];
      for (const r of ratings) {
        const cached = await persistence.getCachedAnime(r.anilistId);
        if (cached?.anilistScore) {
          compare.push({
            title: cached.title.english ?? cached.title.romaji,
            yours: r.score,
            anilist: Math.round(cached.anilistScore) / 10,
          });
        }
      }
      setScoreCompare(compare);
    })();
  }, []);

  async function unhide(anilistId: number) {
    await persistence.unhideAnime(anilistId);
    setHiddenList((prev) => prev.filter((h) => h.anilistId !== anilistId));
  }

  async function setVisibility(value: ContentVisibility) {
    setSettings(await persistence.updateSettings({ contentVisibility: value }));
  }

  async function setSpoilerLevel(value: SpoilerLevel) {
    setSettings(await persistence.updateSettings({ spoilerLevel: value }));
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
    if (rebuildingTaste) return;
    setRebuildingTaste(true);
    try {
      await tasteService.rebuildTasteProfile(true);
      setTaste(await persistence.getTasteProfile());
    } finally {
      setRebuildingTaste(false);
    }
  }

  if (!settings) return null;

  const genreChart = Object.entries(genreDistribution)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, weight]) => ({ genre, weight: Math.round(weight * 10) / 10 }));

  const avgDelta =
    scoreCompare.length > 0
      ? scoreCompare.reduce((s, c) => s + (c.yours - c.anilist), 0) / scoreCompare.length
      : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <nav aria-label="Profile tools" className="grid grid-cols-2 gap-2">
        {[
          { href: "#taste", label: "Taste DNA", icon: Star },
          { href: "#preferences", label: "Preferences", icon: Settings },
          { href: "#anilist-import", label: "AniList import", icon: Download },
          { href: "#hidden", label: "Hidden titles", icon: EyeOff },
          { href: "#characters", label: "Characters", icon: User },
          { href: "#data", label: "Backup data", icon: Upload },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium pressable"
          >
            <item.icon className="size-4 text-muted-foreground" />
            {item.label}
          </a>
        ))}
      </nav>

      <VisionGatewayCard />

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

      <section id="taste" className="scroll-mt-24 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium flex items-center gap-2">
            <Star className="h-4 w-4" /> Taste DNA
          </h2>
          <div className="flex items-center gap-1">
            {(taste?.summary || Object.values(genreDistribution).some((w) => w > 0)) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                disabled={sharingCard}
                onClick={() => void shareTaste()}
              >
                <Share2 className="mr-1 h-3 w-3" />
                {sharingCard ? "Drawing…" : "Share"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              disabled={rebuildingTaste}
              onClick={() => void rebuildTaste()}
            >
              {rebuildingTaste ? "Asking DeepSeek…" : "Rebuild"}
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          {taste?.summary ? (
            <p className="text-sm">{taste.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {Object.keys(taste?.stats ?? {}).length > 0
                ? `${Object.keys(taste!.stats).length} taste signals recorded. Rebuild writes a Taste DNA blurb via the Worker.`
                : "No taste data yet — rate anime, pick favorites, or talk to Buddy."}
            </p>
          )}
        </div>
        {genreChart.length >= 3 && (
          <Suspense fallback={<ChartSkeleton className="h-48" />}>
            <GenreChart data={genreChart} />
          </Suspense>
        )}
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

      {scoreCompare.length >= 3 && (
        <section className="space-y-3">
          <h2 className="font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> You vs the crowd
          </h2>
          <p className="text-xs text-muted-foreground">
            {avgDelta >= 0 ? "You rate" : "You rate"} {Math.abs(avgDelta).toFixed(1)}{" "}
            {avgDelta >= 0 ? "higher" : "lower"} than the AniList crowd on average (
            {scoreCompare.length} rated). X = AniList score, Y = yours.
          </p>
          <Suspense fallback={<ChartSkeleton className="h-56" />}>
            <ScoreCompareChart data={scoreCompare} />
          </Suspense>
        </section>
      )}

      <section id="preferences" className="scroll-mt-24 space-y-3">
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

      <section className="space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <Settings className="h-4 w-4" /> Spoilers
        </h2>
        <div className="space-y-2">
          <Label htmlFor="spoilers">How Ren talks about plot</Label>
          <Select
            value={settings.spoilerLevel ?? "normal"}
            onValueChange={(v) => void setSpoilerLevel(v as SpoilerLevel)}
          >
            <SelectTrigger id="spoilers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strict">Strict — no plot past your episode</SelectItem>
              <SelectItem value="normal">Normal — no twists or endings</SelectItem>
              <SelectItem value="off">Off — no extra lock</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Caps come from Library progress. Ren still never invents plot.
          </p>
        </div>
      </section>

      <section id="hidden" className="scroll-mt-24 space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <EyeOff className="h-4 w-4" /> Hidden titles
        </h2>
        {hiddenList.length > 0 ? (
          <ul className="space-y-1.5">
            {hiddenList.map((h) => (
              <li
                key={h.anilistId}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{h.title}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void unhide(h.anilistId)}>
                  Unhide
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            “Not for me” titles are hidden from For you, Tonight and Buddy picks — forever, until you unhide them here.
          </p>
        )}
      </section>

      <section id="characters" className="scroll-mt-24 space-y-3">
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

      <section id="anilist-import" className="scroll-mt-24 space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <Download className="h-4 w-4" /> Import from AniList
        </h2>
        <p className="text-xs text-muted-foreground">
          One-time pull of a public AniList list onto this device. No account. Titles you already
          have get updated; ratings import as whole points.
        </p>
        <div className="flex gap-2">
          <Input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            placeholder="AniList username"
            className="h-10"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") void previewImport();
            }}
          />
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={importBusy || !importName.trim()}
            onClick={() => void previewImport()}
          >
            {importBusy && !importPreview ? "Fetching…" : "Fetch list"}
          </Button>
        </div>
        {importError && <p className="text-sm text-destructive">{importError}</p>}
        {importPreview && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">
              {importPreview.entries.length} titles · {importPreview.rated} rated
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {(
                [
                  ["watching", "Watching"],
                  ["completed", "Completed"],
                  ["plan_to_watch", "Plan to watch"],
                  ["on_hold", "On hold"],
                  ["dropped", "Dropped"],
                ] as const
              )
                .filter(([key]) => importPreview.byStatus[key] > 0)
                .map(([key, label]) => `${label} ${importPreview.byStatus[key]}`)
                .join(" · ")}
            </p>
            <Button className="w-full" disabled={importBusy} onClick={() => void applyImport()}>
              {importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : "Import into my library"}
            </Button>
          </div>
        )}
      </section>

      <section id="data" className="scroll-mt-24 space-y-3">
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

      <section className="space-y-2 border-t border-border pt-6">
        <h2 className="font-medium flex items-center gap-2 text-sm">
          <Settings className="h-4 w-4" /> App version
        </h2>
        <div className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground space-y-1.5">
          <p className="text-sm text-foreground font-medium">
            v{APP_VERSION}
            {APP_COMMIT !== "local" && (
              <span className="ml-2 font-normal text-muted-foreground">· {APP_COMMIT}</span>
            )}
          </p>
          {APP_BUILT_AT && <p>Built {APP_BUILT_AT}</p>}
          {versionCheck?.status === "loading" && <p>Checking for updates…</p>}
          {versionCheck?.status === "latest" && (
            <p className="text-emerald-500/90">You have the latest build.</p>
          )}
          {versionCheck?.status === "update" && (
            <div className="space-y-2">
              <p className="text-amber-500/90">
                Newer build online: v{versionCheck.latest?.version}
                {versionCheck.latest?.commit ? ` · ${versionCheck.latest.commit}` : ""}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="h-8"
                onClick={() => window.location.reload()}
              >
                Reload for update
              </Button>
            </div>
          )}
          {versionCheck?.status === "unknown" && (
            <p>Could not reach the version feed (offline or blocked).</p>
          )}
        </div>
      </section>
    </div>
  );
}
