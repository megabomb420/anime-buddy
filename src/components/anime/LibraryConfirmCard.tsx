import { useState } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { animeTitle, anilistScore10, seasonLabel } from "@/lib/media";
import { libraryStatusLabel } from "@/lib/buddy-library";
import type { LibraryStatus } from "@/types/entities";
import type { RecPick } from "./RecPickCard";
import { PosterImage } from "./Poster";

export function LibraryConfirmCard({
  pick,
  status,
  polish,
  progress,
  score,
  action,
  onConfirm,
}: {
  pick: RecPick;
  status?: LibraryStatus;
  polish: boolean;
  progress?: number;
  /** When set, this card confirms a rating instead of a library status. */
  score?: number;
  /** Full override for the confirm button label (favorite/remove/note/rewatch). */
  action?: string;
  onConfirm: (pick: RecPick) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const name = animeTitle(pick);
  const meta = [seasonLabel(pick.season, pick.seasonYear), pick.format?.replace(/_/g, " ")]
    .filter(Boolean)
    .join(" · ");
  const alScore = anilistScore10(pick.anilistScore);

  let actionLabel: string;
  if (action) {
    actionLabel = action;
  } else if (score != null) {
    actionLabel = polish ? `Zatwierdź · ${score}/10` : `Confirm · ${score}/10`;
  } else if (status) {
    const label = libraryStatusLabel(status, polish);
    const prog =
      progress != null ? (polish ? ` · odc. ${progress}` : ` · ep ${progress}`) : "";
    actionLabel = polish ? `Zatwierdź · ${label}${prog}` : `Confirm · ${label}${prog}`;
  } else {
    actionLabel = polish ? "Zatwierdź" : "Confirm";
  }

  async function confirm() {
    if (busy || done) return;
    setBusy(true);
    try {
      await onConfirm(pick);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card poster-shadow">
      <div className="flex gap-3 p-2">
        <Link
          to={`/anime/${pick.anilistId}`}
          className="h-[5.5rem] w-[3.7rem] shrink-0 overflow-hidden rounded-md bg-muted"
        >
          <PosterImage src={pick.coverImage} alt="" />
        </Link>
        <div className="min-w-0 flex-1 py-0.5">
          <Link
            to={`/anime/${pick.anilistId}`}
            className="line-clamp-2 text-sm font-medium leading-snug text-foreground hover:underline"
          >
            {name}
          </Link>
          {meta && <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p>}
          {alScore && <p className="mt-0.5 text-[11px] text-muted-foreground">AniList {alScore}</p>}
        </div>
      </div>
      <div className="border-t border-border px-2 py-2">
        <Button
          type="button"
          size="sm"
          className="h-8 w-full rounded-full text-xs"
          disabled={busy || done}
          onClick={() => void confirm()}
        >
          <Check className="size-3.5" />
          {done ? (polish ? "Zapisane" : "Saved") : actionLabel}
        </Button>
      </div>
    </div>
  );
}
