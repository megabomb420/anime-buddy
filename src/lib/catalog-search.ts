import type { AnimeSummary } from "@/types/anime";
import { parseLibraryReadIntent } from "./buddy-library.ts";

/**
 * Fold case, accents, and ×/x so "spy x family" matches "SPY×FAMILY".
 * Critical: multiplication sign with no spaces must become " x ", not "x".
 */
export function normalizeTitleKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[×✕✖⨯ⅹｘ]/gi, " x ")
    .replace(/([a-z0-9])x([a-z0-9])/gi, "$1 x $2")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Community shorthands and common misspellings → canonical AniList search
 * string. Keyed by a compact key: normalizeTitleKey output with lone "x"
 * tokens and all whitespace removed, so "spy x family", "spy family" and
 * "spyxfamily" all collapse to the same key "spyfamily".
 */
const TITLE_ALIASES: Record<string, string> = {
  spyfamily: "SPY×FAMILY",
  spyxfam: "SPY×FAMILY",
  spyfam: "SPY×FAMILY",
  jjk: "Jujutsu Kaisen",
  jujutsu: "Jujutsu Kaisen",
  aot: "Attack on Titan",
  snk: "Attack on Titan",
  attacktitan: "Attack on Titan",
  shingeki: "Shingeki no Kyojin",
  demonslayer: "Demon Slayer: Kimetsu no Yaiba",
  kimetsu: "Demon Slayer: Kimetsu no Yaiba",
  kny: "Demon Slayer: Kimetsu no Yaiba",
  chainsaw: "Chainsaw Man",
  chainsawman: "Chainsaw Man",
  mha: "My Hero Academia",
  bnha: "My Hero Academia",
  bokunohero: "My Hero Academia",
  opm: "One Punch Man",
  onepunch: "One Punch Man",
  hxh: "Hunter x Hunter",
  hunterhunter: "Hunter x Hunter",
  fmab: "Fullmetal Alchemist: Brotherhood",
  fma: "Fullmetal Alchemist",
  dungeonmeshi: "Delicious in Dungeon",
  deliciousindungeon: "Delicious in Dungeon",
  oshinoko: "Oshi no Ko",
  bleachtybw: "Bleach: Thousand-Year Blood War",
  drstone: "Dr. Stone",
  mobpsycho: "Mob Psycho 100",
  mob: "Mob Psycho 100",
  konosuba: "KonoSuba: God's Blessing on This Wonderful World!",
  rezero: "Re:Zero kara Hajimeru Isekai Seikatsu",
  apothecary: "The Apothecary Diaries",
  apothecarydiaries: "The Apothecary Diaries",
  kusuriya: "The Apothecary Diaries",
  sololeveling: "Solo Leveling",
  oregairu: "My Teen Romantic Comedy SNAFU",
  snafu: "My Teen Romantic Comedy SNAFU",
  kaguya: "Kaguya-sama: Love is War",
  kaguyasama: "Kaguya-sama: Love is War",
  evangelion: "Neon Genesis Evangelion",
  nge: "Neon Genesis Evangelion",
  sao: "Sword Art Online",
  danmachi: "Is It Wrong to Try to Pick Up Girls in a Dungeon?",
  overlord: "Overlord",
  vinland: "Vinland Saga",
  berserk: "Berserk",
  frieren: "Sousou no Frieren",
  jojos: "JoJo's Bizarre Adventure",
  jojo: "JoJo's Bizarre Adventure",
  csm: "Chainsaw Man",
  dandadan: "Dandadan",
  kaiju8: "Kaiju No. 8",
};

/** Compact key for alias lookup: no spaces, no lone "x" token. */
function aliasKey(raw: string): string {
  return normalizeTitleKey(raw)
    .replace(/\bx\b/g, " ")
    .replace(/\s+/g, "");
}

/** Canonical AniList search string for a known shorthand, else null. */
export function aliasForTitle(raw: string): string | null {
  const key = aliasKey(raw);
  if (key.length < 2) return null;
  return TITLE_ALIASES[key] ?? null;
}

export interface SeasonHint {
  /** Title with the season marker removed. */
  title: string;
  /** 1-based season number when the user asked for one ("s1", "season 2"). */
  season?: number;
}

/** "spy family s1" / "sezon 2 Naruto" / "Jujutsu Kaisen 2nd season" → hint. */
export function extractSeasonHint(raw: string): SeasonHint {
  const text = raw.trim();
  const m =
    text.match(/\b(?:season|sezon|part|cour)\s*(\d{1,2})\b/i) ??
    text.match(/\bs(\d{1,2})\b/i) ??
    text.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i);
  if (!m) return { title: text };
  const season = Number(m[1]);
  if (!Number.isFinite(season) || season < 1 || season > 20) return { title: text };
  const title = text.replace(m[0], " ").replace(/\s+/g, " ").trim();
  return title.length >= 2 ? { title, season } : { title: text };
}

/** Levenshtein with early exit once the distance provably exceeds max. */
function levenshteinWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Season number embedded in a catalog title ("Season 2", "Part 2", "II"). */
function catalogSeasonOf(anime: AnimeSummary): number | undefined {
  const t = normalizeTitleKey(
    [anime.title.english, anime.title.romaji].filter(Boolean).join(" "),
  );
  const m = t.match(/\b(?:season|part|cour)\s*(\d{1,2})\b/);
  if (m) return Number(m[1]);
  if (/\b(?:ii|2nd)\b/.test(t)) return 2;
  if (/\b(?:iii|3rd)\b/.test(t)) return 3;
  return undefined;
}

/** Queries to try against AniList (original + folded variants + alias). */
export function searchQueryVariants(raw: string): string[] {
  const base = raw.trim();
  if (!base) return [];
  const alias = aliasForTitle(base);
  const key = normalizeTitleKey(base);
  const noLoneX = key.replace(/\bx\b/g, " ").replace(/\s+/g, " ").trim();
  const spacedX = key.replace(/\s*x\s*/g, " x ").replace(/\s+/g, " ").trim();
  const out = [
    // Alias first — one AniList hit on the canonical title beats five fuzzy tries.
    ...(alias ? [alias] : []),
    base,
    key,
    noLoneX,
    spacedX,
    key.replace(/\s+x\s+/g, " "),
    // AniList often indexes the no-space form for SPY×FAMILY
    key.replace(/\s+/g, ""),
    noLoneX.replace(/\s+/g, ""),
  ];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const v of out) {
    const t = v.trim();
    if (t.length < 2) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(t);
  }
  return unique;
}

function titleKeys(anime: AnimeSummary): string[] {
  return [anime.title.english, anime.title.romaji, anime.title.native]
    .filter((t): t is string => Boolean(t && t.trim()))
    .map(normalizeTitleKey);
}

/** Higher = better match for ranking search hits. */
export function scoreTitleMatch(query: string, anime: AnimeSummary, season?: number): number {
  const q = normalizeTitleKey(query);
  if (!q) return 0;
  const alias = aliasForTitle(query);
  const titles = titleKeys(anime);
  let best = 0;
  const qTokens = q.split(" ").filter(Boolean);
  const qCompact = q.replace(/\s+/g, "");
  const qCompactNoX = q.replace(/\bx\b/g, "").replace(/\s+/g, "");

  // Alias hit on any catalog title is a confident match.
  if (alias && titles.some((t) => t === normalizeTitleKey(alias))) {
    best = 96;
  }

  for (const t of titles) {
    const tCompact = t.replace(/\s+/g, "");
    const tCompactNoX = t.replace(/\bx\b/g, "").replace(/\s+/g, "");
    if (t === q || tCompact === qCompact || (qCompactNoX && tCompactNoX === qCompactNoX)) {
      best = Math.max(best, 100);
      continue;
    }
    if (t.startsWith(q) || q.startsWith(t) || tCompact.startsWith(qCompact)) {
      best = Math.max(best, 92);
      continue;
    }
    if (t.includes(q) || q.includes(t) || tCompact.includes(qCompact)) {
      best = Math.max(best, 85);
      continue;
    }
    const tTokens = t.split(" ").filter(Boolean);
    if (tTokens.length === 0) continue;
    const meaningfulQ = qTokens.filter((tok) => tok !== "x");
    const meaningfulT = new Set(tTokens.filter((tok) => tok !== "x"));

    // Token subset: every query token must appear in the title
    // ("spy family" ⊆ {spy, x, family}). Require ≥2 tokens, or one
    // distinctive token (≥5 chars) so "naruto" still matches.
    if (meaningfulQ.length > 0 && meaningfulQ.every((tok) => meaningfulT.has(tok))) {
      if (meaningfulQ.length >= 2 || meaningfulQ[0].length >= 5) {
        best = Math.max(best, 90);
        continue;
      }
    }

    const hits = meaningfulQ.filter((tok) => meaningfulT.has(tok)).length;
    const ratio = hits / (meaningfulQ.length || qTokens.length);
    best = Math.max(best, Math.round(ratio * 80));

    // Typo tolerance: Levenshtein ≤ 2 on the compact form, short titles only.
    if (qCompact.length >= 4 && qCompact.length <= 20 && tCompact.length <= 24) {
      const d = levenshteinWithin(qCompact, tCompact, 2);
      if (d <= 2) best = Math.max(best, d === 0 ? 100 : 78 - d * 3);
    }
  }

  // Season hint: prefer the requested cours, push other seasons down.
  if (season != null && best > 0) {
    const entrySeason = catalogSeasonOf(anime);
    if (entrySeason === season) best = Math.min(100, best + 4);
    else if (entrySeason != null) best = Math.min(best, 70);
    // Base series (no season marker): fine for s1, can't satisfy s2+.
    else if (season === 1) best = Math.min(100, best + 2);
    else best = Math.min(best, 70);
  }
  return best;
}

export function rankByTitleMatch(
  query: string,
  items: AnimeSummary[],
  season?: number,
): AnimeSummary[] {
  return [...items].sort((a, b) => scoreTitleMatch(query, b, season) - scoreTitleMatch(query, a, season));
}

export type TitleResolution =
  | { kind: "match"; anime: AnimeSummary; score: number }
  | { kind: "candidates"; items: AnimeSummary[] }
  | { kind: "none"; bestGuess?: AnimeSummary };

/**
 * Decide what a ranked search result set means for a write intent:
 * - "match": one confident hit → confirm straight away, never ask for a
 *   "clearer title".
 * - "candidates": 2–3 plausible titles (max 3) → user picks one.
 * - "none": nothing usable; bestGuess (score ≥ 40) can be offered as a
 *   "did you mean" card instead of a dead end.
 */
export function resolveTitleMatch(
  query: string,
  items: AnimeSummary[],
  season?: number,
): TitleResolution {
  const ranked = rankByTitleMatch(query, items, season);
  if (ranked.length === 0) return { kind: "none" };
  const topScore = scoreTitleMatch(query, ranked[0], season);
  const secondScore = ranked[1] ? scoreTitleMatch(query, ranked[1], season) : 0;

  if (topScore >= 80 && topScore - secondScore >= 10) {
    return { kind: "match", anime: ranked[0], score: topScore };
  }

  const plausible = ranked
    .filter((a) => scoreTitleMatch(query, a, season) >= 50)
    .slice(0, 3);
  if (plausible.length === 1 && topScore >= 65) {
    return { kind: "match", anime: plausible[0], score: topScore };
  }
  if (plausible.length > 0) return { kind: "candidates", items: plausible };
  return { kind: "none", bestGuess: topScore >= 40 ? ranked[0] : undefined };
}

/** "znajdź Spy x Family" / "find Naruto" — title lookup, not a status write. */
export function parseLookupQuery(raw: string): string | null {
  const text = raw.trim();
  const m = text.match(
    /^(?:(?:czy\s+)?(?:możesz|mozesz)\s+)?(?:znajd[źz]|znale[źz][ćc]|szukaj|wyszukaj|szukam|find|search(?:\s+for)?|look\s*up|locate)(?:\s+mi)?\s+(.+)$/i,
  );
  if (m?.[1]) {
    const q = m[1].replace(/[.!?]+$/, "").replace(/^(?:tytuł|title)\s+/i, "").trim();
    return q.length >= 2 ? q : null;
  }
  return null;
}

/**
 * Bare title-ish line: few words, no recommendation phrasing → treat as catalog lookup.
 * Keeps "Something funny" chips out via wantsRecommendation-style guards in caller.
 */
export function parseBareTitleQuery(raw: string): string | null {

  const text = raw.trim();
  if (text.length < 3 || text.length > 80) return null;
  if (/[?？]/.test(text)) return null;
  if (parseLookupQuery(text)) return null;
  if (parseLibraryReadIntent(text)) return null;
  if (
    /pole[cć]|recommend|watch|tonight|wieczor|something |co ogl|co obej|surprise|zabawn|mroczn|daję|rate |episode |odcinek|skończy|oglądam|finished|watching|plan to|kto to|who is|tell me about|opowiedz|ile odcink|jaka ocena|score of|posta[cć]/i.test(
      text,
    )
  ) {
    return null;
  }
  // 1–6 tokens, mostly letters
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 6) return null;
  if (!/[a-zà-žąćęłńóśźż]/i.test(text)) return null;
  return text;
}

export interface CompareQuery {
  a: string;
  b: string;
}

const COMPARE_HARD_SPLIT = /\s+(?:vs\.?|versus)\s+/i;
const COMPARE_SOFT_SPLIT = /\s+(?:and|i|z|ze)\s+/i;

/**
 * "compare Naruto and Bleach" / "porównaj Naruto z Bleach" / bare "Naruto vs Bleach"
 * → side-by-side catalog compare. The soft split (and / i / z) only applies
 * after an explicit compare prefix so titles containing "and" stay safe.
 */
export function parseCompareQuery(raw: string): CompareQuery | null {
  const text = raw.trim().replace(/[.!?]+$/, "").trim();
  if (text.length < 5) return null;

  const prefixed = text.match(
    /^(?:(?:czy\s+)?(?:możesz|mozesz)\s+)?(?:compare|porównaj|porownaj|zestaw)\s+(.+)$/i,
  );

  let parts: string[];
  if (prefixed?.[1]) {
    const inner = prefixed[1].trim();
    parts = inner.split(COMPARE_HARD_SPLIT);
    if (parts.length !== 2) parts = inner.split(COMPARE_SOFT_SPLIT);
  } else {
    if (!COMPARE_HARD_SPLIT.test(text)) return null;
    parts = text.split(COMPARE_HARD_SPLIT);
  }
  if (parts.length !== 2) return null;

  const a = parts[0].trim();
  const b = parts[1].trim();
  if (a.length < 2 || b.length < 2) return null;
  if (a.toLowerCase() === b.toLowerCase()) return null;
  return { a, b };
}
