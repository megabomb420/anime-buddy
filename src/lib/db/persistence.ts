/**
 * Persistence layer — the ONLY place components/services talk to IndexedDB.
 *
 * Components must not call Dexie directly; they go through these
 * repositories so schema details and validation stay in one place.
 */

import { db } from "./database";
import type {
  AgeGuideRecord,
  AnimeCacheEntry,
  AnimeRating,
  CharacterDNA,
  CharacterRecord,
  FavoriteAnime,
  Conversation,
  CrunchyrollAvailabilityRecord,
  ExternalIdMapping,
  HiddenAnime,
  LibraryEntry,
  LibraryStatus,
  Message,
  RecommendationFeedback,
  RecommendationRecord,
  SemanticMemory,
  Settings,
  TasteProfile,
  TasteSignal,
  UserNote,
  UserProfile,
} from "@/types/entities";

const now = () => Date.now();
export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${now()}-${Math.random().toString(36).slice(2)}`;

/** User ratings use 1.0–10.0 with half points. */
export function assertHalfPointScore(score: number): void {
  if (!Number.isFinite(score) || score < 1 || score > 10 || (score * 2) % 1 !== 0) {
    throw new Error(`Invalid score ${score}: must be 1.0–10.0 in 0.5 steps`);
  }
}

const DEFAULT_SETTINGS: Settings = {
  id: "main",
  region: "IE",
  contentVisibility: "hide_18_plus",
  onboardingCompleted: false,
  updatedAt: 0,
};

export const persistence = {
  // ----- profile & settings -----

  async getOrCreateProfile(): Promise<UserProfile> {
    const existing = await db.userProfiles.get("main");
    if (existing) return existing;
    const profile: UserProfile = { id: "main", createdAt: now(), updatedAt: now() };
    await db.userProfiles.put(profile);
    return profile;
  },

  async getSettings(): Promise<Settings> {
    const existing = await db.settings.get("main");
    if (existing) return existing;
    const settings = { ...DEFAULT_SETTINGS, updatedAt: now() };
    await db.settings.put(settings);
    return settings;
  },

  async updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
    const current = await this.getSettings();
    const next = { ...current, ...patch, id: "main", updatedAt: now() };
    await db.settings.put(next);
    return next;
  },

  // ----- catalog cache -----

  async cacheAnime(entry: AnimeCacheEntry): Promise<void> {
    await db.animeCache.put({ ...entry, cachedAt: now() });
  },

  async getCachedAnime(anilistId: number): Promise<AnimeCacheEntry | undefined> {
    return db.animeCache.get(anilistId);
  },

  async searchCachedAnime(text: string, limit = 50): Promise<AnimeCacheEntry[]> {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return db.animeCache
      .filter((a) => {
        const romaji = a.title.romaji.toLowerCase();
        const english = (a.title.english ?? "").toLowerCase();
        const native = (a.title.native ?? "").toLowerCase();
        return romaji.includes(q) || english.includes(q) || native.includes(q);
      })
      .limit(limit)
      .toArray();
  },

  async saveIdMapping(mapping: ExternalIdMapping): Promise<void> {
    await db.externalIdMappings.put({ ...mapping, updatedAt: now() });
  },

  async getIdMapping(anilistId: number): Promise<ExternalIdMapping | undefined> {
    return db.externalIdMappings.get(anilistId);
  },

  async saveAvailability(record: CrunchyrollAvailabilityRecord): Promise<void> {
    await db.crunchyrollAvailability.put(record);
  },

  async getAvailability(
    anilistId: number,
    region: string,
  ): Promise<CrunchyrollAvailabilityRecord | undefined> {
    return db.crunchyrollAvailability.get(`${anilistId}:${region}`);
  },

  async saveAgeGuide(record: AgeGuideRecord): Promise<void> {
    await db.ageGuides.put({ ...record, updatedAt: now() });
  },

  async getAgeGuide(anilistId: number, region: string): Promise<AgeGuideRecord | undefined> {
    return db.ageGuides.get(`${anilistId}:${region}`);
  },

  // ----- library -----

  async setLibraryStatus(
    anilistId: number,
    status: LibraryStatus,
    progress = 0,
  ): Promise<LibraryEntry> {
    const existing = await db.libraryEntries.get(anilistId);
    const nextProgress = progress > 0 ? progress : (existing?.progress ?? 0);
    const entry: LibraryEntry = {
      anilistId,
      status,
      progress: nextProgress,
      startedAt:
        existing?.startedAt ?? (status === "watching" || status === "completed" ? now() : undefined),
      completedAt: status === "completed" ? now() : existing?.completedAt,
      updatedAt: now(),
    };
    await db.libraryEntries.put(entry);
    if (progress > 0) await this.setProgress(anilistId, progress);
    return entry;
  },

  async getLibrary(status?: LibraryStatus): Promise<LibraryEntry[]> {
    if (status) return db.libraryEntries.where("status").equals(status).toArray();
    return db.libraryEntries.toArray();
  },

  /** Episode caps for Ren's spoiler lock (library progress ∪ spoilerStates ∪ viewingProgress). */
  async getSpoilerLimits(): Promise<
    Array<{ anilistId: number; maxEpisodeSeen: number; title?: string }>
  > {
    const [states, library, progress] = await Promise.all([
      db.spoilerStates.toArray(),
      db.libraryEntries.toArray(),
      db.viewingProgress.toArray(),
    ]);
    const map = new Map<number, number>();
    const bump = (id: number, ep: number) => {
      if (!Number.isFinite(ep) || ep < 1) return;
      map.set(id, Math.max(map.get(id) ?? 0, ep));
    };
    for (const s of states) bump(s.anilistId, s.maxEpisodeSeen);
    for (const e of library) bump(e.anilistId, e.progress);
    for (const p of progress) bump(p.anilistId, p.episode);

    const out: Array<{ anilistId: number; maxEpisodeSeen: number; title?: string }> = [];
    for (const [anilistId, maxEpisodeSeen] of map) {
      const cached = await this.getCachedAnime(anilistId);
      out.push({
        anilistId,
        maxEpisodeSeen,
        title: cached?.title.english ?? cached?.title.romaji,
      });
    }
    return out.slice(0, 30);
  },

  async removeLibraryEntry(anilistId: number): Promise<void> {
    await db.libraryEntries.delete(anilistId);
  },

  async setAnimeRating(anilistId: number, score: number): Promise<void> {
    assertHalfPointScore(score);
    await db.animeRatings.put({ anilistId, score, updatedAt: now() });
  },

  async getAnimeRating(anilistId: number): Promise<AnimeRating | undefined> {
    return db.animeRatings.get(anilistId);
  },

  async getAnimeRatings(): Promise<AnimeRating[]> {
    return db.animeRatings.toArray();
  },

  async getLibraryEntry(anilistId: number): Promise<LibraryEntry | undefined> {
    return db.libraryEntries.get(anilistId);
  },

  /** Undo support: put back a previously captured entry verbatim. */
  async restoreLibraryEntry(entry: LibraryEntry): Promise<void> {
    await db.libraryEntries.put(entry);
  },

  async getProgress(anilistId: number): Promise<number | undefined> {
    return (await db.viewingProgress.get(anilistId))?.episode;
  },

  /** Undo support: restore (or clear) a previously captured episode count. */
  async restoreProgress(anilistId: number, episode: number | undefined): Promise<void> {
    if (episode === undefined) {
      await db.viewingProgress.delete(anilistId);
    } else {
      await db.viewingProgress.put({ anilistId, episode, updatedAt: now() });
    }
  },

  async removeAnimeRating(anilistId: number): Promise<void> {
    await db.animeRatings.delete(anilistId);
  },

  /** Undo support: put back a previously captured rating verbatim. */
  async restoreAnimeRating(rating: AnimeRating): Promise<void> {
    await db.animeRatings.put(rating);
  },

  async getFavoriteAnime(): Promise<FavoriteAnime[]> {
    return db.favoriteAnime.toArray();
  },

  async setProgress(anilistId: number, episode: number): Promise<void> {
    await db.viewingProgress.put({ anilistId, episode, updatedAt: now() });
    const spoiler = await db.spoilerStates.get(anilistId);
    if (!spoiler || spoiler.maxEpisodeSeen < episode) {
      await db.spoilerStates.put({ anilistId, maxEpisodeSeen: episode, updatedAt: now() });
    }
  },

  async addFavoriteAnime(anilistId: number, rank?: number): Promise<void> {
    await db.favoriteAnime.put({ anilistId, rank, addedAt: now() });
  },

  async removeFavoriteAnime(anilistId: number): Promise<void> {
    await db.favoriteAnime.delete(anilistId);
  },

  // ----- characters -----

  async cacheCharacter(character: CharacterRecord): Promise<void> {
    await db.characters.put({ ...character, cachedAt: now() });
  },

  async getCharacter(characterId: number): Promise<CharacterRecord | undefined> {
    return db.characters.get(characterId);
  },

  async addFavoriteCharacter(characterId: number): Promise<void> {
    await db.favoriteCharacters.put({ characterId, addedAt: now() });
  },

  async setCharacterRating(characterId: number, score: number): Promise<void> {
    assertHalfPointScore(score);
    await db.characterRatings.put({ characterId, score, updatedAt: now() });
  },

  // ----- notes & taste -----

  async addNote(input: Omit<UserNote, "id" | "createdAt" | "updatedAt">): Promise<UserNote> {
    const note: UserNote = { ...input, id: newId(), createdAt: now(), updatedAt: now() };
    await db.userNotes.put(note);
    return note;
  },

  async getNotesFor(subjectType: UserNote["subjectType"], subjectId: number): Promise<UserNote[]> {
    return db.userNotes
      .where("subjectId")
      .equals(subjectId)
      .filter((n) => n.subjectType === subjectType)
      .toArray();
  },

  async addTasteSignal(input: Omit<TasteSignal, "id" | "createdAt">): Promise<TasteSignal> {
    const signal: TasteSignal = { ...input, id: newId(), createdAt: now() };
    await db.tasteSignals.put(signal);
    return signal;
  },

  async getTasteSignals(): Promise<TasteSignal[]> {
    return db.tasteSignals.toArray();
  },

  async getTasteProfile(): Promise<TasteProfile> {
    const existing = await db.tasteProfiles.get("main");
    if (existing) return existing;
    const profile: TasteProfile = { id: "main", stats: {}, version: 1, updatedAt: now() };
    await db.tasteProfiles.put(profile);
    return profile;
  },

  async saveTasteProfile(patch: Partial<Omit<TasteProfile, "id">>): Promise<void> {
    const current = await this.getTasteProfile();
    await db.tasteProfiles.put({ ...current, ...patch, id: "main", updatedAt: now() });
  },

  async getCharacterDNA(): Promise<CharacterDNA> {
    const existing = await db.characterDNA.get("main");
    if (existing) return existing;
    const dna: CharacterDNA = { id: "main", archetypes: {}, updatedAt: now() };
    await db.characterDNA.put(dna);
    return dna;
  },

  async saveCharacterDNA(patch: Partial<Omit<CharacterDNA, "id">>): Promise<void> {
    const current = await this.getCharacterDNA();
    await db.characterDNA.put({ ...current, ...patch, id: "main", updatedAt: now() });
  },

  // ----- memory / conversations / recommendations -----

  async addMemory(input: Omit<SemanticMemory, "id" | "createdAt">): Promise<SemanticMemory> {
    const memory: SemanticMemory = { ...input, id: newId(), createdAt: now() };
    await db.semanticMemories.put(memory);
    return memory;
  },

  async createConversation(title?: string): Promise<Conversation> {
    const conversation: Conversation = { id: newId(), title, createdAt: now(), updatedAt: now() };
    await db.conversations.put(conversation);
    return conversation;
  },

  async addMessage(input: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const message: Message = { ...input, id: newId(), createdAt: now() };
    await db.messages.put(message);
    await db.conversations.update(input.conversationId, { updatedAt: now() });
    return message;
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    return db.messages.where("conversationId").equals(conversationId).sortBy("createdAt");
  },

  async saveRecommendation(
    input: Omit<RecommendationRecord, "id" | "createdAt">,
  ): Promise<RecommendationRecord> {
    const record: RecommendationRecord = { ...input, id: newId(), createdAt: now() };
    await db.recommendations.put(record);
    return record;
  },

  async addRecommendationFeedback(
    input: Omit<RecommendationFeedback, "id" | "createdAt">,
  ): Promise<RecommendationFeedback> {
    const record: RecommendationFeedback = { ...input, id: newId(), createdAt: now() };
    await db.recommendationFeedback.put(record);
    return record;
  },

  // ----- permanent "Not for me" exclusions -----

  async hideAnime(anilistId: number, reason?: string): Promise<void> {
    await db.hiddenAnime.put({ anilistId, reason, createdAt: now() });
  },

  async unhideAnime(anilistId: number): Promise<void> {
    await db.hiddenAnime.delete(anilistId);
  },

  async getHiddenAnime(): Promise<HiddenAnime[]> {
    return db.hiddenAnime.toArray();
  },

  // ----- export/import (whole personal dataset) -----

  async exportAll(): Promise<Record<string, unknown[]>> {
    const dump: Record<string, unknown[]> = {};
    for (const table of db.tables) {
      dump[table.name] = await table.toArray();
    }
    return dump;
  },

  async importAll(dump: Record<string, unknown[]>): Promise<void> {
    await db.transaction("rw", db.tables, async () => {
      for (const table of db.tables) {
        const rows = dump[table.name];
        if (Array.isArray(rows)) {
          await table.clear();
          await table.bulkPut(rows as never[]);
        }
      }
    });
  },
};
