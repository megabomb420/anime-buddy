import type { LibraryStatus } from "@/types/entities";

export interface LibraryIntent {
  status: LibraryStatus;
  query: string;
  /** Episode number when the user reports progress. */
  progress?: number;
  /** Optional free-text reason (e.g. drop why). */
  reason?: string;
}

export interface RateIntent {
  kind: "rate";
  query: string;
  score: number;
}

export type BuddyWriteIntent =
  | ({ kind: "library" } & LibraryIntent)
  | RateIntent;

const STATUS_PATTERNS: Array<{ status: LibraryStatus; re: RegExp }> = [
  {
    status: "completed",
    re: /^(?:skończył[ae]?m|obejrzał[ae]?m|oglądał[ae]?m|przeszedł[ae]?m|dopatrzył[ae]?m|watched|finished|completed|i(?:'| a)?m done with)\s+(.+)$/i,
  },
  {
    status: "watching",
    re: /^(?:oglądam|patrzę|aktualnie oglądam|i(?:'| a)?m watching|watching|currently watching)\s+(.+)$/i,
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

/** "jestem na 12 odcinku Naruto" / "episode 12 of Naruto" / "Naruto ep 12". */
const PROGRESS_RES: RegExp[] = [
  /^(?:jestem na|I'm on|i am on|on)\s+(?:odc(?:inek|inku)?\s*)?(\d{1,4})\s*(?:odc(?:inek|inku)?|ep(?:isode)?)?\s*(?:of|z|w)?\s+(.+)$/i,
  /^(?:odcinek|episode|ep)\s*(\d{1,4})\s*(?:of|z|w|:)?\s+(.+)$/i,
  /^(.+?)\s+(?:odcinek|episode|ep)\s*(\d{1,4})\s*$/i,
  /^(.+?)\s+[-–]\s*(?:odc|ep)\.?\s*(\d{1,4})\s*$/i,
];

/** "daję 9 Naruto" / "rate Naruto 8.5" / "Naruto 9/10". */
const RATE_RES: RegExp[] = [
  /^(?:daję|daje|rate(?:d)?)\s+(\d{1,2}(?:[.,]5)?)\s*(?:\/\s*10)?\s+(?:dla\s+|na\s+|for\s+)?(.+)$/i,
  /^(.+?)\s+(?:na|at|score)?\s*(\d{1,2}(?:[.,]5)?)\s*\/\s*10\s*$/i,
  /^(?:ocena|score)\s+(\d{1,2}(?:[.,]5)?)\s+(?:dla\s+|for\s+)?(.+)$/i,
];

function statusFromWord(word: string): LibraryStatus {
  const w = word.toLowerCase();
  if (/obejrz|ukończ|completed|watched/.test(w)) return "completed";
  if (/watching|ogląd/.test(w)) return "watching";
  if (/plan/.test(w)) return "plan_to_watch";
  if (/drop|rzu|porzu/.test(w)) return "dropped";
  if (/hold|pauza|wstrzym/.test(w)) return "on_hold";
  return "plan_to_watch";
}

function cleanTitle(q: string): string {
  return q
    .replace(/[.!?]+$/, "")
    .replace(/\s+(?:bo|because|boże|,)\s+.+$/i, "")
    .trim();
}

function parseScore(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  const half = Math.round(n * 2) / 2;
  if (half < 1 || half > 10) return null;
  return half;
}

function splitDropReason(body: string): { query: string; reason?: string } {
  const m = body.match(/^(.+?)\s+(?:bo|because)\s+(.+)$/i);
  if (m?.[1] && m?.[2]) return { query: cleanTitle(m[1]), reason: m[2].trim() };
  return { query: cleanTitle(body) };
}

export function parseProgressIntent(raw: string): LibraryIntent | null {
  const text = raw.trim();
  for (const re of PROGRESS_RES) {
    const m = text.match(re);
    if (!m) continue;
    // groups differ by pattern order
    let ep: number;
    let title: string;
    if (/^\d+$/.test(m[1] ?? "") && m[2]) {
      ep = Number(m[1]);
      title = m[2];
    } else if (m[2] && /^\d+$/.test(m[2])) {
      title = m[1];
      ep = Number(m[2]);
    } else continue;
    if (!Number.isFinite(ep) || ep < 1 || ep > 5000) continue;
    const query = cleanTitle(title);
    if (query.length < 2) continue;
    return { status: "watching", query, progress: ep };
  }
  return null;
}

export function parseRateIntent(raw: string): RateIntent | null {
  const text = raw.trim();
  for (const re of RATE_RES) {
    const m = text.match(re);
    if (!m?.[1] || !m[2]) continue;
    let scoreRaw: string;
    let title: string;
    if (/^\d/.test(m[1])) {
      scoreRaw = m[1];
      title = m[2];
    } else {
      title = m[1];
      scoreRaw = m[2];
    }
    const score = parseScore(scoreRaw);
    if (score == null) continue;
    const query = cleanTitle(title);
    if (query.length < 2) continue;
    return { kind: "rate", query, score };
  }
  return null;
}

export function parseLibraryIntent(raw: string): LibraryIntent | null {
  const progress = parseProgressIntent(raw);
  if (progress) return progress;

  const text = raw.trim();
  if (text.length < 4) return null;

  const mark = text.match(MARK_AS);
  if (mark?.[1] && mark[2]) {
    return { status: statusFromWord(mark[2]), query: cleanTitle(mark[1]) };
  }

  for (const { status, re } of STATUS_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      if (status === "dropped") {
        const { query, reason } = splitDropReason(m[1]);
        if (query.length >= 2) return { status, query, reason };
      } else {
        const query = cleanTitle(m[1]);
        if (query.length >= 2) return { status, query };
      }
    }
  }
  return null;
}

/** Library write OR rating — checked before free chat. */
export function parseBuddyWriteIntent(raw: string): BuddyWriteIntent | null {
  const rate = parseRateIntent(raw);
  if (rate) return rate;
  const lib = parseLibraryIntent(raw);
  if (lib) return { kind: "library", ...lib };
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
  progress?: number,
): string {
  const label = libraryStatusLabel(status, polish);
  const prog =
    progress != null
      ? polish
        ? ` (odc. ${progress})`
        : ` (ep ${progress})`
      : "";
  if (count === 0) {
    return polish
      ? "Nie znalazłem tego w katalogu. Podaj dokładniejszy tytuł."
      : "Nothing matched the catalog. Give me a clearer title.";
  }
  if (count === 1) {
    return polish
      ? `Chodzi o to? Zatwierdź kartę — wtedy oznaczę jako ${label}${prog}.`
      : `This one? Confirm the card and I'll mark it ${label}${prog}.`;
  }
  return polish
    ? `Kilka trafień. Które dokładnie? Zatwierdź kartę — zapiszę jako ${label}${prog}.`
    : `A few matches. Which exact title? Confirm a card — I'll mark it ${label}${prog}.`;
}

export function libraryDoneReply(
  title: string,
  status: LibraryStatus,
  polish: boolean,
  progress?: number,
): string {
  const label = libraryStatusLabel(status, polish);
  const prog =
    progress != null
      ? polish
        ? `, odc. ${progress}`
        : `, ep ${progress}`
      : "";
  return polish
    ? `Jest. „${title}” → ${label}${prog}. Możesz to zmienić w Library.`
    : `Done. “${title}” → ${label}${prog}. You can change it in Library.`;
}

export function ratePromptReply(score: number, count: number, polish: boolean): string {
  if (count === 0) {
    return polish
      ? "Nie znalazłem tytułu do oceny. Podaj dokładniej."
      : "Couldn't match a title to rate. Be more specific.";
  }
  if (count === 1) {
    return polish
      ? `Ocena ${score}/10 — to ten tytuł? Zatwierdź kartę.`
      : `Score ${score}/10 — this title? Confirm the card.`;
  }
  return polish
    ? `Ocena ${score}/10. Który tytuł? Zatwierdź kartę.`
    : `Score ${score}/10. Which title? Confirm a card.`;
}

export function rateDoneReply(title: string, score: number, polish: boolean): string {
  return polish
    ? `Zapisane. „${title}” → ${score}/10.`
    : `Saved. “${title}” → ${score}/10.`;
}
