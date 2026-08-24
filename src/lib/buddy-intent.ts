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
  /pole[cć]|polecisz|co (og[lł][aą]da[cć]|obejrze[cć]|og[lł][aą]damy)|na wiecz[oó]r|watch tonight|what (should i |to )?watch|recommend|\brecs?\b|co[śs] (zabawnego|mrocznego|kr[oó]tkiego|lekkiego)|something (funny|dark|short|light)|podobn[ea] do|surprise me|zaskocz|hidden gem|nudzi mi si[eę]|nie wiem co (og[lł]|obejr)|daj (mi )?(co[śs]|tytu[lł])|watch next|co obejrze[cć]|after |po (obejrzeniu |skończeniu )?|what next/i;

const NOT_REC =
  /ile odcink|how many episode|kto (to|gra|dubbing)|who (is|plays)|co to za postać|what character|score of|ocena /i;

/** True when Ren should pull catalog cards with covers, not just talk. */
export function wantsRecommendation(raw: string): boolean {
  const q = raw.trim();
  if (q.length < 3) return false;
  if (NOT_REC.test(q)) return false;
  if (BUDDY_CHIPS.some((c) => c.label.toLowerCase() === q.toLowerCase())) return true;
  return REC_ASK.test(q);
}

/** Mood/vague asks should not be sent to AniList as a title search. */
export function isVagueCatalogQuery(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  if (wantsRecommendation(q) && !/(podobn\w*\s+do|like |jak |after |po )/.test(q)) return true;
  return /^(surprise me|zaskocz|co ogląda[cć]|co obejrze[cć]|tonight|wieczorem)$/i.test(q);
}

/** Extract "I have 40 minutes" style budgets. */
export function parseTimeBudgetMinutes(raw: string): number | undefined {
  const q = raw.toLowerCase();
  const hour = q.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|godzin)/i);
  if (hour) {
    const h = Number(hour[1].replace(",", "."));
    if (Number.isFinite(h) && h > 0 && h <= 12) return Math.round(h * 60);
  }
  const min = q.match(/(?:mam|have|got)?\s*(\d{1,3})\s*(?:min(?:ute)?s?|minut)/i);
  if (min) {
    const m = Number(min[1]);
    if (Number.isFinite(m) && m >= 10 && m <= 600) return m;
  }
  if (/one sitting|na raz|jednym posiedzeniu/.test(q)) return 90;
  if (/tonight|wieczor/.test(q) && /short|kr[oó]tk/.test(q)) return 60;
  return undefined;
}

/** "what next after Attack on Titan" / "po Naruto". */
export function parseAfterTitle(raw: string): string | undefined {
  const m = raw.match(
    /(?:(?:what )?next after|after (?:watching )?|podobn\w* do|like|jak|po (?:obejrzeniu |skończeniu )?)\s+(.+)$/i,
  );
  if (!m?.[1]) return undefined;
  const title = m[1].replace(/[.!?]+$/, "").trim();
  return title.length >= 2 ? title : undefined;
}

/** Map a free-text request onto catalog search + recommendation context. Never invents titles. */
export function interpretBuddyQuery(raw: string): BuddyPrompt {
  const q = raw.trim();
  const lower = q.toLowerCase();

  const chip = BUDDY_CHIPS.find((c) => c.label.toLowerCase() === lower);
  if (chip) return chip;

  const after = parseAfterTitle(q);
  if (after && /after |next after|po (?:obejrzeniu|skończeniu)|podobn|like |jak /.test(lower)) {
    return {
      label: q,
      query: after,
      context: "similar",
      timeBudgetMinutes: parseTimeBudgetMinutes(q),
    };
  }

  const budget = parseTimeBudgetMinutes(q);

  if (/funny|comedy|laugh|zabawn|komedi/.test(lower)) {
    return { label: q, query: "comedy slice of life", context: "mood-funny", timeBudgetMinutes: budget };
  }
  if (/dark|grim|psychological|horror|mroczn|psychologiczn/.test(lower)) {
    return { label: q, query: "psychological thriller", context: "mood-dark", timeBudgetMinutes: budget };
  }
  if (budget != null || /short|tonight|one sitting|wieczor|kr[oó]tk/.test(lower)) {
    return {
      label: q,
      query: budget != null ? `anime under about ${budget} minutes total runtime or short series` : q,
      context: "tonight",
      timeBudgetMinutes: budget ?? 90,
    };
  }
  if (/12\+|family|kids|teen|rodzin/.test(lower)) {
    return { label: q, query: q, context: "family", timeBudgetMinutes: budget };
  }
  if (/surprise|zaskocz/.test(lower)) {
    return { label: q, query: q, context: "surprise", timeBudgetMinutes: budget };
  }
  return {
    label: q,
    query: q,
    context: wantsRecommendation(q) ? "chat-rec" : "chat",
    timeBudgetMinutes: budget,
  };
}
