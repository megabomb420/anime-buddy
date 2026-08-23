/**
 * TasteService — learns the user's taste from ratings, reactions, lists,
 * notes, favorites and feedback.
 *
 * Deterministic parts (signal aggregation, stats) are TypeScript. The
 * natural-language "Taste DNA" interpretation is delegated to AIProvider
 * via analyzeTaste()/extractTasteSignals() — and never invents metadata.
 */

import { db } from "@/lib/db/database";
import { persistence } from "@/lib/db/persistence";
import { providers } from "@/lib/providers";
import type { TasteProfile, TasteSignal } from "@/types/entities";

export class TasteService {
  /** Record taste signals from a user rating of an anime. */
  async learnFromRating(anilistId: number, score: number): Promise<void> {
    const anime = await persistence.getCachedAnime(anilistId);
    if (!anime) return;
    // Normalize 1–10 → -1..1 around 5.5.
    const weight = Math.max(-1, Math.min(1, (score - 5.5) / 4.5));
    for (const genre of anime.genres) {
      await persistence.addTasteSignal({
        kind: "genre",
        value: genre.toLowerCase(),
        weight,
        source: "rating",
        subjectId: anilistId,
      });
    }
  }

  /** Extract taste signals from a written note (WHY they liked/disliked it). */
  async learnFromNote(noteId: string): Promise<TasteSignal[]> {
    const record = await db.userNotes.get(noteId);
    if (!record) return [];
    try {
      const extracted = await providers.ai.extractTasteSignals(record.body);
      const saved: TasteSignal[] = [];
      for (const e of extracted) {
        saved.push(
          await persistence.addTasteSignal({
            kind: e.kind,
            value: e.value.toLowerCase(),
            weight: e.weight,
            source: "ai-extraction",
            subjectId: record.subjectId,
          }),
        );
      }
      return saved;
    } catch {
      return [];
    }
  }

  /** Deterministic stats snapshot + optional AI-written summary. */
  async rebuildTasteProfile(withAiSummary = false): Promise<TasteProfile> {
    const signals = await persistence.getTasteSignals();
    const stats: Record<string, number> = {};
    for (const s of signals) {
      const key = `${s.kind}:${s.value}`;
      stats[key] = (stats[key] ?? 0) + s.weight;
    }

    let summary: string | undefined;
    if (withAiSummary) {
      const ratings = await db.animeRatings.toArray();
      const favorites = await db.favoriteAnime.toArray();
      const titles = await Promise.all(
        ratings.slice(0, 50).map(async (r) => {
          const anime = await persistence.getCachedAnime(r.anilistId);
          return { anilistId: r.anilistId, title: anime?.title.romaji ?? `#${r.anilistId}`, score: r.score };
        }),
      );
      try {
        summary = await providers.ai.analyzeTaste({
          ratings: titles,
          favorites: favorites.map((f) => String(f.anilistId)),
          notes: [],
        });
      } catch {
        summary = undefined; // AI summary is optional; stats are the truth
      }
    }

    const current = await persistence.getTasteProfile();
    await persistence.saveTasteProfile({
      stats,
      summary: summary ?? current.summary,
      version: current.version + 1,
    });
    return persistence.getTasteProfile();
  }
}

export const tasteService = new TasteService();
