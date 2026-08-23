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

/** Map a free-text request onto catalog search + recommendation context. Never invents titles. */
export function interpretBuddyQuery(raw: string): BuddyPrompt {
  const q = raw.trim();
  const lower = q.toLowerCase();
  if (/funny|comedy|laugh/.test(lower)) {
    return { label: q, query: `${q} comedy`, context: "mood-funny" };
  }
  if (/dark|grim|psychological|horror/.test(lower)) {
    return { label: q, query: `${q} psychological thriller`, context: "mood-dark" };
  }
  if (/short|tonight|one sitting|90 min|hour/.test(lower)) {
    return { label: q, query: q, context: "tonight", timeBudgetMinutes: 90 };
  }
  if (/12\+|family|kids|teen/.test(lower)) {
    return { label: q, query: q, context: "family" };
  }
  if (/madoka|like .+/.test(lower)) {
    return { label: q, query: q, context: "similar" };
  }
  if (/surprise/.test(lower)) {
    return { label: q, query: q, context: "surprise" };
  }
  return { label: q, query: q, context: "chat" };
}
