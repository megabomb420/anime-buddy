import type { AnimeSummary } from "@/types/anime";

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

/** Queries to try against AniList (original + folded variants). */
export function searchQueryVariants(raw: string): string[] {
  const base = raw.trim();
  if (!base) return [];
  const key = normalizeTitleKey(base);
  const noLoneX = key.replace(/\bx\b/g, " ").replace(/\s+/g, " ").trim();
  const spacedX = key.replace(/\s*x\s*/g, " x ").replace(/\s+/g, " ").trim();
  const out = [
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
export function scoreTitleMatch(query: string, anime: AnimeSummary): number {
  const q = normalizeTitleKey(query);
  if (!q) return 0;
  const titles = titleKeys(anime);
  let best = 0;
  const qTokens = q.split(" ").filter(Boolean);
  const qCompact = q.replace(/\s+/g, "");

  for (const t of titles) {
    const tCompact = t.replace(/\s+/g, "");
    if (t === q || tCompact === qCompact) {
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
    const hits = qTokens.filter((tok) => tok !== "x" && tTokens.includes(tok)).length;
    const meaningful = qTokens.filter((tok) => tok !== "x").length || qTokens.length;
    const ratio = hits / meaningful;
    best = Math.max(best, Math.round(ratio * 80));
  }
  return best;
}

export function rankByTitleMatch(query: string, items: AnimeSummary[]): AnimeSummary[] {
  return [...items].sort((a, b) => scoreTitleMatch(query, b) - scoreTitleMatch(query, a));
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
  if (
    /pole[cć]|recommend|watch|tonight|wieczor|something |co ogl|co obej|surprise|zabawn|mroczn|daję|rate |episode |odcinek|skończy|oglądam|finished|watching|plan to/i.test(
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
