import type { LibraryStatus } from "@/types/entities";

export interface LibraryIntent {
  status: LibraryStatus;
  query: string;
  /** One or more titles from a batch log ("Naruto, Bleach and One Piece"). */
  titles: string[];
  /** Episode number when the user reports progress. */
  progress?: number;
  /** Optional free-text reason (e.g. drop why). */
  reason?: string;
}

export interface RateIntent {
  kind: "rate";
  query: string;
  titles: string[];
  score: number;
}

export interface LibraryReadIntent {
  kind: "library-read";
  /** Missing = whole library. */
  status?: LibraryStatus;
}

export type BuddyWriteIntent =
  | ({ kind: "library" } & LibraryIntent)
  | RateIntent;

const STATUS_PATTERNS: Array<{ status: LibraryStatus; re: RegExp }> = [
  {
    status: "completed",
    re: /^(?:skończył[ae]?m|obejrzał[ae]?m|oglądał[ae]?m|przeszedł[ae]?m|dopatrzył[ae]?m|(?:i\s+)?(?:watched|finished|completed)|i(?:'| a)?m done with)\s+(.+)$/i,
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
    .replace(/\s+(?:bo|because|boże)\s+.+$/i, "")
    .trim();
}

const JOINER = /^(?:and|&|or|i|oraz|und)$/i;

/**
 * Split "AoT, Naruto, and One Piece" / "Frieren and Dungeon Meshi".
 * Does not split on `;` so Steins;Gate stays one title.
 */
export function splitTitleList(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const commaChunks = text.split(/\s*,\s*/);
  const chunks: string[] = [];
  for (const c of commaChunks) {
    chunks.push(...c.split(/\s+(?:and|&|oraz|und|i)\s+/i));
  }

  const titles: string[] = [];
  for (const chunk of chunks) {
    let part = chunk.trim();
    part = part.replace(/^(?:and|&|or|i|oraz|und)\s+/i, "").replace(/[.!?]+$/g, "").trim();
    if (!part || JOINER.test(part) || part.length < 2) continue;
    if (!titles.some((t) => t.toLowerCase() === part.toLowerCase())) titles.push(part);
    if (titles.length >= 6) break;
  }
  return titles.length ? titles : [text.replace(/[.!?]+$/, "").trim()].filter((t) => t.length >= 2);
}

function withTitles<T extends { query: string }>(intent: T, split: boolean): T & { titles: string[] } {
  const titles = split ? splitTitleList(intent.query) : [intent.query];
  return { ...intent, query: titles[0] ?? intent.query, titles };
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
    return { status: "watching", query, titles: [query], progress: ep };
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
    return withTitles({ kind: "rate" as const, query, score }, true);
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
    const query = cleanTitle(mark[1]);
    return withTitles({ status: statusFromWord(mark[2]), query }, true);
  }

  for (const { status, re } of STATUS_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      if (status === "dropped") {
        const { query, reason } = splitDropReason(m[1]);
        if (query.length >= 2) return withTitles({ status, query, reason }, true);
      } else {
        const query = cleanTitle(m[1]);
        if (query.length >= 2) return withTitles({ status, query }, true);
      }
    }
  }
  return null;
}

const LIBRARY_READ: Array<{ status?: LibraryStatus; re: RegExp }> = [
  { status: "watching", re: /^(?:what(?:'s| is)?(?: on)?(?: my)? watching|what am i watching|co (?:aktualnie )?oglądam|moje oglądane)\s*[?.!]*$/i },
  { status: "completed", re: /^(?:what have i (?:finished|completed|watched)|co (?:skończył[ae]?m|obejrzał[ae]?m)|my completed)\s*[?.!]*$/i },
  { status: "plan_to_watch", re: /^(?:what(?:'s| is) (?:on )?my (?:plan|watchlist|plan to watch)|co planuję|moja (?:watchlista|lista życzeń))\s*[?.!]*$/i },
  { status: "dropped", re: /^(?:what (?:did i )?drop(?:ped)?|co rzucił[ae]?m|moje rzucone)\s*[?.!]*$/i },
  { status: "on_hold", re: /^(?:what(?:'s| is) on hold|co (?:mam )?wstrzymane)\s*[?.!]*$/i },
  {
    status: undefined,
    re: /^(?:what(?:'s| is) in my (?:library|list)|my library|my list|show my library|co mam w bibliotece|moja biblioteka|moja lista)\s*[?.!]*$/i,
  },
];

/** "what am I watching" — IndexedDB read, no DeepSeek, no catalog invent. */
export function parseLibraryReadIntent(raw: string): LibraryReadIntent | null {
  const text = raw.trim();
  if (text.length < 4) return null;
  if (parseLibraryIntent(text) || parseRateIntent(text)) return null;
  for (const { status, re } of LIBRARY_READ) {
    if (re.test(text)) return { kind: "library-read", status };
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

export function libraryBatchPromptReply(
  status: LibraryStatus,
  found: number,
  asked: number,
  polish: boolean,
): string {
  const label = libraryStatusLabel(status, polish);
  if (found === 0) {
    return polish
      ? "Nie znalazłem tych tytułów w katalogu. Podaj dokładniej."
      : "None of those matched the catalog. Give me clearer titles.";
  }
  if (asked === 1) return libraryPromptReply(status, found, polish);
  return polish
    ? `${found} z ${asked} — zatwierdź każdą kartę, zapiszę jako ${label}.`
    : `${found} of ${asked} — confirm each card and I'll mark them ${label}.`;
}

export function libraryReadReply(
  status: LibraryStatus | undefined,
  count: number,
  polish: boolean,
): string {
  const label = status ? libraryStatusLabel(status, polish) : polish ? "bibliotece" : "library";
  if (count === 0) {
    return polish
      ? status
        ? `Pusto na „${label}”.`
        : "Biblioteka pusta."
      : status
        ? `Nothing in ${label} yet.`
        : "Library is empty.";
  }
  return polish
    ? status
      ? `To jest na „${label}” (${count}):`
      : `Twoja biblioteka (${count}):`
    : status
      ? `On ${label} (${count}):`
      : `Your library (${count}):`;
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
