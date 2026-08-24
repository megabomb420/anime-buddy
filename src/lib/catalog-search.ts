import type { AnimeSummary } from "@/types/anime";

/** Fold case, accents, and ×/x so "spy x family" matches "Spy×Family". */
export function normalizeTitleKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[×✕✖⨯ⅹｘ]/gi, "x")
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
  const out = [base, key, noLoneX, spacedX, key.replace(/\s+x\s+/g, " ")];
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

  for (const t of titles) {
    if (t === q) {
      best = Math.max(best, 100);
      continue;
    }
    if (t.startsWith(q) || q.startsWith(t)) {
      best = Math.max(best, 92);
      continue;
    }
    if (t.includes(q) || q.includes(t)) {
      best = Math.max(best, 85);
      continue;
    }
    const tTokens = t.split(" ").filter(Boolean);
    if (tTokens.length === 0) continue;
    const hits = qTokens.filter((tok) => tTokens.includes(tok)).length;
    const ratio = hits / Math.max(qTokens.length, tTokens.length);
    best = Math.max(best, Math.round(ratio * 75));
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
    /^(?:znajd[źz]|szukaj|wyszukaj|find|search(?:\s+for)?|look\s*up|locate)\s+(.+)$/i,
  );
  if (m?.[1]) {
    const q = m[1].replace(/[.!?]+$/, "").trim();
    return q.length >= 2 ? q : null;
  }
  return null;
}
