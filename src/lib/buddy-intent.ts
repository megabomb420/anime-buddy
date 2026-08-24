export interface BuddyPrompt {
  label: string;
  query: string;
  context: string;
  timeBudgetMinutes?: number;
}

export const BUDDY_CHIPS: BuddyPrompt[] = [
  { label: "Something funny", query: "comedy slice of life funny anime", context: "mood-funny" },
  { label: "Something dark", query: "psychological thriller dark anime", context: "mood-dark" },
  { label: "Short tonight", query: "short anime movie or few episodes", context: "tonight", timeBudgetMinutes: 90 },
  { label: "Popular unread", query: "popular highly rated anime", context: "because-you-like" },
  { label: "Suitable 12+", query: "shounen adventure fantasy suitable for teens", context: "family" },
  { label: "Surprise me", query: "surprise me with something unexpected", context: "surprise" },
];

const REC_ASK =
  /pole[cć]|polecisz|co (og[lł][aą]da[cć]|obejrze[cć]|og[lł][aą]damy)|na wiecz[oó]r|watch tonight|what (should i |to )?watch|recommend|\brecs?\b|co[śs] (zabawnego|mrocznego|kr[oó]tkiego|lekkiego)|something (funny|dark|short|light)|podobn[ea] do|surprise me|zaskocz|hidden gem|nudzi mi si[eę]|nie wiem co (og[lł]|obejr)|daj (mi )?(co[śs]|tytu[lł])|watch next|co obejrze[cć]/i;

const NOT_REC =
  /ile odcink|how many episode|kto (to|gra|dubbing)|who (is|plays)|co to za postać|what character|score of|ocena /i;

/** True when Ren should pull catalog cards with covers, not just talk. */
export function wantsRecommendation(raw: string): boolean {
  const q = raw.trim();
  if (q.length < 3) return false;
  if (NOT_REC.test(q)) return false;
  return REC_ASK.test(q);
}

/** Mood/vague asks should not be sent to AniList as a title search. */
export function isVagueCatalogQuery(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (wantsRecommendation(q) && !/(podobn\w*\s+do|like |jak )/.test(q)) return true;
  return /^(surprise me|zaskocz|co ogląda[cć]|co obejrze[cć]|tonight|wieczorem)$/i.test(q);
}

/** Map a free-text request onto catalog search + recommendation context. Never invents titles. */
export function interpretBuddyQuery(raw: string): BuddyPrompt {
  const q = raw.trim();
  const lower = q.toLowerCase();

  const like = q.match(/(?:podobn\w*\s+do|like|jak)\s+(.+)$/i);
  if (like?.[1]) {
    return { label: q, query: like[1].trim(), context: "similar" };
  }
  if (/funny|comedy|laugh|zabawn|komedi/.test(lower)) {
    return { label: q, query: "comedy slice of life", context: "mood-funny" };
  }
  if (/dark|grim|psychological|horror|mroczn|psychologiczn/.test(lower)) {
    return { label: q, query: "psychological thriller", context: "mood-dark" };
  }
  if (/short|tonight|one sitting|90 min|hour|wieczor|kr[oó]tk/.test(lower)) {
    return { label: q, query: q, context: "tonight", timeBudgetMinutes: 90 };
  }
  if (/12\+|family|kids|teen|rodzin/.test(lower)) {
    return { label: q, query: q, context: "family" };
  }
  if (/surprise|zaskocz/.test(lower)) {
    return { label: q, query: q, context: "surprise" };
  }
  return { label: q, query: q, context: wantsRecommendation(q) ? "chat-rec" : "chat" };
}
