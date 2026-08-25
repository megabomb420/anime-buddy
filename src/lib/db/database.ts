/**
 * IndexedDB database — the source of truth for all personal data.
 *
 * Uses Dexie. The schema is VERSIONED from day one:
 *
 *   - Every schema change = a new `this.version(N).stores({...})` block.
 *   - Data transforms go in `.upgrade(tx => ...)`.
 *   - NEVER solve schema changes by deleting the database.
 *
 * Only indexed fields appear in `stores()`; full entity shapes live in
 * src/types/entities.ts.
 */

import Dexie, { type Table } from "dexie";
import type {
  AgeGuideRecord,
  AnimeCacheEntry,
  AnimeRating,
  CharacterDNA,
  CharacterRating,
  CharacterRecord,
  Conversation,
  CrunchyrollAvailabilityRecord,
  ExternalIdMapping,
  FavoriteAnime,
  FavoriteCharacter,
  HiddenAnime,
  LibraryEntry,
  Message,
  RecommendationFeedback,
  RecommendationRecord,
  ScanRecord,
  SemanticMemory,
  Settings,
  SpoilerState,
  TasteProfile,
  TasteSignal,
  UserNote,
  UserProfile,
  ViewingProgress,
} from "@/types/entities";

export const DB_NAME = "anime-buddy";
export const DB_SCHEMA_VERSION = 3;

export class AnimeBuddyDB extends Dexie {
  userProfiles!: Table<UserProfile, string>;
  animeCache!: Table<AnimeCacheEntry, number>;
  externalIdMappings!: Table<ExternalIdMapping, number>;
  crunchyrollAvailability!: Table<CrunchyrollAvailabilityRecord, string>;
  ageGuides!: Table<AgeGuideRecord, string>;
  libraryEntries!: Table<LibraryEntry, number>;
  animeRatings!: Table<AnimeRating, number>;
  viewingProgress!: Table<ViewingProgress, number>;
  favoriteAnime!: Table<FavoriteAnime, number>;
  characters!: Table<CharacterRecord, number>;
  favoriteCharacters!: Table<FavoriteCharacter, number>;
  characterRatings!: Table<CharacterRating, number>;
  userNotes!: Table<UserNote, string>;
  tasteProfiles!: Table<TasteProfile, string>;
  tasteSignals!: Table<TasteSignal, string>;
  characterDNA!: Table<CharacterDNA, string>;
  semanticMemories!: Table<SemanticMemory, string>;
  recommendations!: Table<RecommendationRecord, string>;
  recommendationFeedback!: Table<RecommendationFeedback, string>;
  hiddenAnime!: Table<HiddenAnime, number>;
  conversations!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  spoilerStates!: Table<SpoilerState, number>;
  scanRecords!: Table<ScanRecord, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super(DB_NAME);

    // v1 — initial schema.
    this.version(1).stores({
      userProfiles: "id",
      animeCache: "anilistId, malId, seasonYear, cachedAt, *genres",
      externalIdMappings: "anilistId, malId, tmdbId",
      crunchyrollAvailability: "id, animeId, region, state",
      ageGuides: "id, anilistId, region",
      libraryEntries: "anilistId, status, updatedAt",
      animeRatings: "anilistId, score, updatedAt",
      viewingProgress: "anilistId, updatedAt",
      favoriteAnime: "anilistId, addedAt",
      characters: "id, cachedAt",
      favoriteCharacters: "characterId, addedAt",
      characterRatings: "characterId, updatedAt",
      userNotes: "id, subjectType, subjectId, createdAt",
      tasteProfiles: "id",
      tasteSignals: "id, kind, value, source, createdAt",
      characterDNA: "id",
      semanticMemories: "id, kind, createdAt",
      recommendations: "id, context, createdAt",
      recommendationFeedback: "id, recommendationId, anilistId, createdAt",
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt",
      spoilerStates: "anilistId, updatedAt",
      settings: "id",
    });

    // v2 — permanent "Not for me" exclusions.
    this.version(2).stores({
      hiddenAnime: "anilistId, createdAt",
    });

    // v3 — scan history (the figurine "shelf").
    this.version(3).stores({
      scanRecords: "id, anilistId, createdAt",
    });

    // Example for future migrations — add a new version, never edit v1:
    //
    // this.version(2)
    //   .stores({ userNotes: "id, subjectType, subjectId, createdAt, sentiment" })
    //   .upgrade(async (tx) => {
    //     await tx.table("userNotes").toCollection().modify((note) => {
    //       note.sentiment ??= "neutral";
    //     });
    //   });
  }
}

/** Singleton database instance. */
export const db = new AnimeBuddyDB();
