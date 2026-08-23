import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Heart, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { persistence } from "@/lib/db/persistence";
import { db } from "@/lib/db/database";
import type { CharacterSummary } from "@/types/anime";
import type { UserNote } from "@/types/entities";

export default function CharacterDetailPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const id = Number(characterId);

  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [rating, setRating] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [showSlider, setShowSlider] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      const [cached, fav, rate, allNotes] = await Promise.all([
        persistence.getCharacter(id),
        db.favoriteCharacters.get(id),
        db.characterRatings.get(id),
        persistence.getNotesFor("character", id),
      ]);
      setCharacter(cached ?? null);
      setIsFavorite(!!fav);
      setRating(rate?.score);
      setNotes(allNotes);
    })();
  }, [id]);

  async function toggleFavorite() {
    if (isFavorite) {
      await db.favoriteCharacters.delete(id);
      setIsFavorite(false);
    } else {
      await persistence.addFavoriteCharacter(id);
      setIsFavorite(true);
    }
  }

  async function saveRating(score: number) {
    await persistence.setCharacterRating(id, score);
    setRating(score);
  }

  async function saveNote() {
    if (!note.trim()) return;
    const saved = await persistence.addNote({ subjectType: "character", subjectId: id, body: note.trim() });
    setNotes((prev) => [...prev, saved]);
    setNote("");
  }

  async function deleteNote(noteId: string) {
    await db.userNotes.delete(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  if (!character) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Character not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{character.name}</h1>
        <Button variant="ghost" size="icon" className={isFavorite ? "text-red-500" : ""} onClick={toggleFavorite}>
          <Heart className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
        </Button>
      </div>

      <div className="flex gap-4">
        {character.image ? (
          <img src={character.image} alt="" className="h-40 w-28 rounded-lg object-cover" loading="lazy" />
        ) : (
          <div className="h-40 w-28 rounded-lg bg-muted" />
        )}
        <div className="flex-1 space-y-2">
          {character.nameNative && <p className="text-sm text-muted-foreground">{character.nameNative}</p>}
          {character.favorites !== undefined && (
            <Badge variant="outline">{character.favorites.toLocaleString()} favorites on AniList</Badge>
          )}
          {rating !== undefined && (
            <div className="flex items-center gap-1 text-sm">
              <Star className="h-4 w-4 text-yellow-400" />
              <span className="font-medium">{rating}</span>
              <span className="text-xs text-muted-foreground">Your rating</span>
            </div>
          )}
        </div>
      </div>

      {/* Rating */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Rating</p>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowSlider((v) => !v)}>
            {showSlider ? "Hide" : "Set"}
          </Button>
        </div>
        {showSlider && (
          <div className="space-y-2">
            <Slider value={[rating ?? 5]} min={1} max={10} step={0.5} onValueChange={([v]) => saveRating(v)} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span className="font-medium text-foreground">{rating ?? "—"}</span>
              <span>10</span>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {character.description && (
        <div className="space-y-2">
          <h2 className="font-medium">About</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {character.description.replace(/<[^>]+>/g, "")}
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-3">
        <h2 className="font-medium">Notes</h2>
        <div className="flex gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why do you love this character?"
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
    </div>
  );
}
