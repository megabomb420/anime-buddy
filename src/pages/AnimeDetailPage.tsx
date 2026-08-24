import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Heart,
  Minus,
  Play,
  Plus,
  Star,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { AgeBadge } from "@/components/AgeBadge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/database";
import { providers } from "@/lib/providers";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { persistence } from "@/lib/db/persistence";
import { tasteService } from "@/lib/services/TasteService";
import type { AnimeSummary, CharacterSummary } from "@/types/anime";
import type { LibraryEntry, LibraryStatus, UserNote } from "@/types/entities";

const STATUS_LABELS: Record<LibraryStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  plan_to_watch: "Want to Watch",
  on_hold: "On Hold",
  dropped: "Dropped",
};

const STATUS_OPTIONS: LibraryStatus[] = [
  "watching",
  "completed",
  "plan_to_watch",
  "on_hold",
  "dropped",
];

const REACTIONS = [
  { key: "loved", label: "Loved it", emoji: "🤩" },
  { key: "good", label: "Good", emoji: "👍" },
  { key: "mixed", label: "Mixed", emoji: "🤔" },
  { key: "meh", label: "Meh", emoji: "😕" },
  { key: "hated", label: "Hated it", emoji: "👎" },
  { key: "dropped", label: "Dropped", emoji: "🚫" },
] as const;

function scoreFromReaction(key: string): number | undefined {
  switch (key) {
    case "loved":
      return 9;
    case "good":
      return 7.5;
    case "mixed":
      return 5;
    case "meh":
      return 3.5;
    case "hated":
      return 2;
    case "dropped":
      return 1;
    default:
      return undefined;
  }
}

export default function AnimeDetailPage() {
  const { anilistId } = useParams<{ anilistId: string }>();
  const navigate = useNavigate();
  const id = Number(anilistId);

  const [anime, setAnime] = useState<AnimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryEntry, setLibraryEntry] = useState<LibraryEntry | undefined>();
  const [rating, setRating] = useState<number | undefined>();
  const [isFavorite, setIsFavorite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [showRatingSlider, setShowRatingSlider] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [showAllChars, setShowAllChars] = useState(false);
  const [spoilerLevel, setSpoilerLevel] = useState<"strict" | "normal" | "off">("normal");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [cached, lib, favs, rate, prog, allNotes, chars] = await Promise.all([
          animeCatalogService.getAnime(id),
          persistence.getLibrary().then((all) => all.find((e) => e.anilistId === id)),
          persistence.getCachedAnime(id).then(() => db.favoriteAnime.get(id)),
          persistence.getAnimeRating(id),
          persistence.getCachedAnime(id).then(() => db.viewingProgress.get(id)),
          persistence.getNotesFor("anime", id),
          animeCatalogService.getAnime(id).then((a) => (a ? providers.catalog.getCharacters(a.anilistId) : [])),
        ]);
        if (!mounted) return;
        setAnime(cached);
        setLibraryEntry(lib);
        setIsFavorite(!!favs);
        setRating(rate?.score);
        setProgress(prog?.episode ?? 0);
        setNotes(allNotes);
        setCharacters(chars);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Lazy enrich: MAL extras + age guide + availability
  useEffect(() => {
    if (!anime) return;
    let mounted = true;
    (async () => {
      const settings = await persistence.getSettings();
      const region = settings.region;
      let updated = await animeCatalogService.enrichWithMalExtras(anime);
      updated = await animeCatalogService.resolveAgeGuideFor(updated, region);
      updated = await animeCatalogService.resolveAvailabilityFor(updated, region);
      if (mounted) setAnime(updated);
    })();
    return () => {
      mounted = false;
    };
  }, [anime?.anilistId]);

  async function setStatus(status: LibraryStatus) {
    const entry = await persistence.setLibraryStatus(id, status, progress);
    setLibraryEntry(entry);
  }

  async function removeFromLibrary() {
    await persistence.removeLibraryEntry(id);
    setLibraryEntry(undefined);
  }

  async function toggleFavorite() {
    if (isFavorite) {
      await persistence.removeFavoriteAnime(id);
      setIsFavorite(false);
    } else {
      await persistence.addFavoriteAnime(id);
      setIsFavorite(true);
    }
  }

  async function saveRating(score: number) {
    await persistence.setAnimeRating(id, score);
    setRating(score);
    await tasteService.learnFromRating(id, score);
    await tasteService.rebuildTasteProfile(false);
  }

  async function applyReaction(key: string) {
    setReaction(key);
    const score = scoreFromReaction(key);
    if (score !== undefined) {
      await saveRating(score);
    }
    if (key === "dropped") {
      await setStatus("dropped");
    }
  }

  async function changeProgress(delta: number) {
    const next = Math.max(0, progress + delta);
    setProgress(next);
    await persistence.setProgress(id, next);
    if (libraryEntry) {
      const updated = await persistence.setLibraryStatus(id, libraryEntry.status, next);
      setLibraryEntry(updated);
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    const saved = await persistence.addNote({ subjectType: "anime", subjectId: id, body: note.trim() });
    setNotes((prev) => [...prev, saved]);
    setNote("");
    await tasteService.learnFromNote(saved.id);
  }

  async function deleteNote(noteId: string) {
    await db.userNotes.delete(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  const displayTitle = useMemo(
    () => anime?.title.english ?? anime?.title.romaji ?? `Anime #${id}`,
    [anime, id],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!anime) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Could not load anime details.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{displayTitle}</h1>
        <Button variant="ghost" size="icon" className={isFavorite ? "text-red-500" : ""} onClick={toggleFavorite}>
          <Heart className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
        </Button>
      </div>

      {/* Banner + Cover */}
      <div className="relative">
        {anime.bannerImage ? (
          <div className="h-40 w-full overflow-hidden rounded-xl">
            <img
              src={anime.bannerImage}
              alt=""
              className="detail-banner-art h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="h-40 w-full rounded-xl bg-muted" />
        )}
        <div className="absolute -bottom-8 left-4">
          {anime.coverImage ? (
            <img
              src={anime.coverImage}
              alt=""
              className="h-28 w-20 rounded-lg border-2 border-background object-cover shadow-lg"
              loading="lazy"
            />
          ) : (
            <div className="h-28 w-20 rounded-lg border-2 border-background bg-muted shadow-lg" />
          )}
        </div>
      </div>

      {/* Spacer for cover overlap */}
      <div className="h-6" />

      {/* Meta */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {anime.format && <Badge variant="outline">{anime.format.replace(/_/g, " ")}</Badge>}
          {anime.status && <Badge variant="outline">{anime.status.replace(/_/g, " ")}</Badge>}
          {anime.season && anime.seasonYear && (
            <Badge variant="outline">
              {anime.season} {anime.seasonYear}
            </Badge>
          )}
          {anime.episodes !== undefined && (
            <Badge variant="outline">
              <Tv className="mr-1 h-3 w-3" />
              {anime.episodes} ep
            </Badge>
          )}
          <AgeBadge guide={anime.ageGuide} />
        </div>
        {anime.studios && anime.studios.length > 0 && (
          <p className="text-xs text-muted-foreground">Studio: {anime.studios.join(" · ")}</p>
        )}
      </div>

      {/* Scores */}
      <div className="flex flex-wrap gap-3">
        {anime.anilistScore !== undefined && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
            <Star className="h-4 w-4 text-yellow-400" />
            <span className="font-medium">{anime.anilistScore / 10}</span>
            <span className="text-xs text-muted-foreground">AniList</span>
          </div>
        )}
        {anime.malScore !== undefined && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
            <Star className="h-4 w-4 text-blue-400" />
            <span className="font-medium">{anime.malScore}</span>
            <span className="text-xs text-muted-foreground">MAL</span>
          </div>
        )}
        {rating !== undefined && (
          <div className="flex items-center gap-1 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm">
            <Star className="h-4 w-4 text-primary" />
            <span className="font-medium">{rating}</span>
            <span className="text-xs text-muted-foreground">Yours</span>
          </div>
        )}
      </div>

      {/* Availability */}
      {anime.availability && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-sm">
            <Play className="h-4 w-4 text-green-400" />
            <span className="font-medium">Crunchyroll</span>
            <Badge
              variant={
                anime.availability.state === "verified"
                  ? "default"
                  : anime.availability.state === "candidate"
                    ? "secondary"
                    : "outline"
              }
              className="text-[10px]"
            >
              {anime.availability.state}
            </Badge>
          </div>
          {anime.availability.note && (
            <p className="mt-1 text-xs text-muted-foreground">{anime.availability.note}</p>
          )}
        </div>
      )}

      {/* Synopsis with spoiler shield */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Synopsis</h2>
          <div className="flex items-center gap-1">
            {(["strict", "normal", "off"] as const).map((level) => (
              <Button
                key={level}
                variant={spoilerLevel === level ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setSpoilerLevel(level)}
              >
                {level}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {spoilerLevel === "strict"
            ? "Synopsis hidden in strict mode."
            : anime.synopsis?.replace(/<[^>]+>/g, "") || "No synopsis available."}
        </p>
      </div>

      {/* Genres & Tags */}
      <div className="space-y-2">
        <h2 className="font-medium">Genres</h2>
        <div className="flex flex-wrap gap-1.5">
          {anime.genres.map((g) => (
            <Badge key={g} variant="secondary" className="text-xs">
              {g}
            </Badge>
          ))}
        </div>
        {anime.tags.length > 0 && (
          <>
            <h2 className="mt-3 font-medium">Tags</h2>
            <div className="flex flex-wrap gap-1.5">
              {anime.tags.slice(0, 16).map((t) => (
                <Badge key={t} variant="outline" className="text-xs font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Personal Controls */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-medium">Your List</h2>

        {/* Status buttons */}
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s}
              variant={libraryEntry?.status === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(s)}
            >
              {libraryEntry?.status === s && <Check className="mr-1 h-3 w-3" />}
              {STATUS_LABELS[s]}
            </Button>
          ))}
          {libraryEntry && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={removeFromLibrary}>
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Progress</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeProgress(-1)}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="min-w-[3ch] text-center text-sm font-medium">
            {progress}/{anime.episodes ?? "?"}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeProgress(1)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Quick reactions */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Quick reaction</p>
          <div className="flex flex-wrap gap-2">
            {REACTIONS.map((r) => (
              <Button
                key={r.key}
                variant={reaction === r.key ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => applyReaction(r.key)}
              >
                {r.emoji} {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Numeric rating */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Numeric rating (optional)</p>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowRatingSlider((v) => !v)}>
              {showRatingSlider ? "Hide" : "Set"}
              <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${showRatingSlider ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {showRatingSlider && (
            <div className="space-y-2">
              <Slider
                value={[rating ?? 5]}
                min={1}
                max={10}
                step={0.5}
                onValueChange={([v]) => saveRating(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span className="font-medium text-foreground">{rating ?? "—"}</span>
                <span>10</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3">
        <h2 className="font-medium">Notes</h2>
        <div className="flex gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Great story but hated the protagonist…"
            className="min-h-[60px] text-sm"
          />
          <Button variant="secondary" size="sm" className="shrink-0 self-end" onClick={saveNote}>
            Save
          </Button>
        </div>
        {notes.length > 0 && (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground">{n.body}</p>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteNote(n.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Characters */}
      {characters.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Characters</h2>
          <div className="grid grid-cols-4 gap-2">
            {(showAllChars ? characters : characters.slice(0, 8)).map((c) => (
              <button
                key={c.id}
                className="flex flex-col items-center gap-1 text-center"
                onClick={() => navigate(`/character/${c.id}`)}
              >
                {c.image ? (
                  <img src={c.image} alt="" className="h-16 w-12 rounded-md object-cover" loading="lazy" />
                ) : (
                  <div className="h-16 w-12 rounded-md bg-muted" />
                )}
                <span className="line-clamp-2 text-[10px] text-muted-foreground">{c.name}</span>
              </button>
            ))}
          </div>
          {characters.length > 8 && (
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAllChars((v) => !v)}>
              {showAllChars ? "Show less" : `Show all ${characters.length}`}
            </Button>
          )}
        </div>
      )}

      {/* Relations */}
      {anime.relations && anime.relations.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">Related</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {anime.relations.map((r) => (
              <button
                key={r.anilistId}
                className="flex w-24 shrink-0 flex-col gap-1 text-left"
                onClick={() => navigate(`/anime/${r.anilistId}`)}
              >
                {r.coverImage ? (
                  <img src={r.coverImage} alt="" className="h-32 w-24 rounded-md object-cover" loading="lazy" />
                ) : (
                  <div className="h-32 w-24 rounded-md bg-muted" />
                )}
                <span className="text-[10px] text-muted-foreground">{r.relationType}</span>
                <span className="line-clamp-2 text-xs font-medium">
                  {r.title.english ?? r.title.romaji}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
