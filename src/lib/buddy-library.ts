import type { LibraryStatus } from "@/types/entities";

export interface LibraryIntent {
  status: LibraryStatus;
  query: string;
}

const STATUS_PATTERNS: Array<{ status: LibraryStatus; re: RegExp }> = [
  {
    status: "completed",
    re: /^(?:skończył[ae]?m|obejrzał[ae]?m|oglądał[ae]?m|przeszedł[ae]?m|dopatrzył[ae]?m|watched|finished|completed|i(?:'| a)?m done with)\s+(.+)$/i,
  },
  {
    status: "watching",
    re: /^(?:oglądam|patrzę|jestem na|aktualnie oglądam|i(?:'| a)?m watching|watching|currently watching)\s+(.+)$/i,
  },
  {
    status: "plan_to_watch",
    re: /^(?:chcę obejrzeć|chce obejrzeć|planuję|na listę|dodaj(?:\s+do\s+biblioteki)?|plan to watch|want to watch|add(?:\s+to\s+(?:my\s+)?list)?)\s+(.+)$/i,
  },
  {
    status: "dropped",
    re: /^(?:rzucił[ae]?m|odpuścił[ae]?m|porzucił[ae]?m|dropped)\s+(.+)$/i,
  },
  {
    status: "on_hold",
    re: /^(?:wstrzymał[ae]?m|pauza na|on hold)\s+(.+)$/i,
  },
];

/** "oznacz Naruto jako obejrzane" style. */
const MARK_AS =
  /^(?:oznacz|mark)\s+(.+?)\s+(?:jako|as)\s+(obejrzan\w*|ukończon\w*|completed|watched|watching|plan(?:_to_watch)?|dropped|on[\s_-]?hold)\s*$/i;

function statusFromWord(word: string): LibraryStatus {
  const w = word.toLowerCase();
  if (/obejrz|ukończ|completed|watched/.test(w)) return "completed";
  if (/watching|ogląd/.test(w)) return "watching";
  if (/plan/.test(w)) return "plan_to_watch";
  if (/drop|rzu|porzu/.test(w)) return "dropped";
  if (/hold|pauza|wstrzym/.test(w)) return "on_hold";
  return "plan_to_watch";
}

export function parseLibraryIntent(raw: string): LibraryIntent | null {
  const text = raw.trim();
  if (text.length < 4) return null;

  const mark = text.match(MARK_AS);
  if (mark?.[1] && mark[2]) {
    return { status: statusFromWord(mark[2]), query: mark[1].trim() };
  }

  for (const { status, re } of STATUS_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const query = m[1].replace(/[.!?]+$/, "").trim();
      if (query.length >= 2) return { status, query };
    }
  }
  return null;
}

export function libraryStatusLabel(status: LibraryStatus, polish: boolean): string {
  if (polish) {
    switch (status) {
      case "completed":
        return "obejrzane";
      case "watching":
        return "oglądam";
      case "plan_to_watch":
        return "planuję";
      case "on_hold":
        return "wstrzymane";
      case "dropped":
        return "rzucone";
    }
  }
  switch (status) {
    case "completed":
      return "completed";
    case "watching":
      return "watching";
    case "plan_to_watch":
      return "plan to watch";
    case "on_hold":
      return "on hold";
    case "dropped":
      return "dropped";
  }
}

export function libraryPromptReply(
  status: LibraryStatus,
  count: number,
  polish: boolean,
): string {
  const label = libraryStatusLabel(status, polish);
  if (count === 0) {
    return polish
      ? "Nie znalazłem tego w katalogu. Podaj dokładniejszy tytuł."
      : "Nothing matched the catalog. Give me a clearer title.";
  }
  if (count === 1) {
    return polish
      ? `Chodzi o to? Zatwierdź kartę — wtedy oznaczę jako ${label}.`
      : `This one? Confirm the card and I'll mark it ${label}.`;
  }
  return polish
    ? `Kilka trafień. Które dokładnie? Zatwierdź kartę — zapiszę jako ${label}.`
    : `A few matches. Which exact title? Confirm a card — I'll mark it ${label}.`;
}

export function libraryDoneReply(title: string, status: LibraryStatus, polish: boolean): string {
  const label = libraryStatusLabel(status, polish);
  return polish
    ? `Jest. „${title}” → ${label}. Możesz to zmienić w Library.`
    : `Done. “${title}” → ${label}. You can change it in Library.`;
}
