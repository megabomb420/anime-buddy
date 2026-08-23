/** Context Buddy can use in conversation (taste summary, spoiler state...). */
export interface BuddyContext {
  tasteSummary?: string;
  characterSummary?: string;
  spoilerLimits?: Array<{ anilistId: number; maxEpisodeSeen: number }>;
  region?: string;
  /** Titles already resolved from the catalog — Buddy must not invent others. */
  catalogPicks?: Array<{ title: string; genres: string[] }>;
}
