/**
 * IndexedDB entity types — the source of truth for all personal data.
 *
 * IndexedDB (via Dexie, see src/lib/db) is the ONLY store for user data.
 * v1 is single-user and local-first: no accounts, no hosted user database.
 *
 * Schema is versioned from day one and changes go through migrations —
 * never delete the database to solve a schema change.
 */

import type { AgeGuide } from "./age";
import type { AnimeSummary, CharacterSummary, CrunchyrollAvailability } from "./anime";
import type { RecPick } from "../components/anime/RecPickCard";

// ---------- Profile & settings ----------

export interface UserProfile {
  /** Singleton id, always "main" in v1. */
  id: string;
  displayName?: string;
  createdAt: number;
  updatedAt: number;
}

export type ContentVisibility = "show_all" | "hide_18_plus" | "family";

export type SpoilerLevel = "strict" | "normal" | "off";

export interface Settings {
  /** Singleton id, always "main" in v1. */
  id: string;
  /** Default availability/certification region. Default "IE". */
  region: string;
  contentVisibility: ContentVisibility;
  /** Family profile: hide anything above this age. */
  maxAge?: number;
  /** How Ren talks about plot. Default "normal". */
  spoilerLevel?: SpoilerLevel;
  onboardingCompleted: boolean;
  updatedAt: number;
}

// ---------- Catalog cache ----------

/** Cached canonical anime record (AnimeSummary with AgeGuide/availability). */
export type AnimeCacheEntry = AnimeSummary;

export interface ExternalIdMapping {
  /** AniList id (primary key). */
  anilistId: number;
  malId?: number;
  tmdbId?: number;
  /** Where the mapping came from: "anilist" | "jikan" | "tmdb" | "manual". */
  source: string;
  updatedAt: number;
}

export type CrunchyrollAvailabilityRecord = CrunchyrollAvailability & {
  /** Primary key: `${anilistId}:${region}`. */
  id: string;
};

/** AgeGuide records kept per anime+region when resolved from remote sources. */
export interface AgeGuideRecord {
  /** Primary key: `${anilistId}:${region}`. */
  id: string;
  anilistId: number;
  region: string;
  guide: AgeGuide;
  updatedAt: number;
}

// ---------- Library ----------

export type LibraryStatus = "watching" | "completed" | "plan_to_watch" | "on_hold" | "dropped";

export interface LibraryEntry {
  /** AniList anime id (primary key). */
  anilistId: number;
  status: LibraryStatus;
  /** Episodes watched. */
  progress: number;
  /** How many times the user restarted this title ("rewatch X" in Buddy). */
  rewatchCount?: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
}

/** User rating: 1.0–10.0 with half points (store as number, validate on write). */
export interface AnimeRating {
  /** AniList anime id (primary key). */
  anilistId: number;
  score: number;
  updatedAt: number;
}

export interface ViewingProgress {
  /** AniList anime id (primary key). */
  anilistId: number;
  episode: number;
  updatedAt: number;
}

export interface FavoriteAnime {
  /** AniList anime id (primary key). */
  anilistId: number;
  rank?: number;
  addedAt: number;
}

// ---------- Characters ----------

export type CharacterRecord = CharacterSummary;

export interface FavoriteCharacter {
  /** AniList character id (primary key). */
  characterId: number;
  addedAt: number;
}

export interface CharacterRating {
  /** AniList character id (primary key). */
  characterId: number;
  /** 1.0–10.0 with half points. */
  score: number;
  updatedAt: number;
}

// ---------- Notes & taste ----------

export type NoteSubjectType = "anime" | "character";

/** Written notes explaining WHY the user liked/disliked something. */
export interface UserNote {
  id: string;
  subjectType: NoteSubjectType;
  /** AniList anime id or character id. */
  subjectId: number;
  body: string;
  /** Optional user-declared sentiment attached to the note. */
  sentiment?: "positive" | "negative" | "mixed" | "neutral";
  createdAt: number;
  updatedAt: number;
}

export type TasteSignalKind =
  | "genre"
  | "tag"
  | "studio"
  | "format"
  | "theme"
  | "character-archetype"
  | "free-text";

export type TasteSignalSource =
  | "rating"
  | "reaction"
  | "note"
  | "favorite"
  | "library"
  | "conversation"
  | "recommendation-feedback"
  | "ai-extraction";

/** A single weighted taste datapoint learned about the user. */
export interface TasteSignal {
  id: string;
  kind: TasteSignalKind;
  /** Normalized value, e.g. "found-family" or "slow-burn". */
  value: string;
  /** Positive = attraction, negative = aversion. Roughly -1..1. */
  weight: number;
  source: TasteSignalSource;
  /** Optional reference to the entity that produced the signal. */
  subjectId?: number;
  createdAt: number;
}

/** Aggregated "Taste DNA" interpretation (AI-written summary + stats). */
export interface TasteProfile {
  /** Singleton id, always "main" in v1. */
  id: string;
  /** AI-generated natural-language taste summary. */
  summary?: string;
  /** Deterministic stats snapshot (genre weights etc.), JSON-friendly. */
  stats: Record<string, number>;
  version: number;
  updatedAt: number;
}

/** Aggregated character-preference profile ("Character DNA"). */
export interface CharacterDNA {
  /** Singleton id, always "main" in v1. */
  id: string;
  /** AI-generated interpretation of favorite/rated characters. */
  summary?: string;
  /** Deterministic archetype weights, JSON-friendly. */
  archetypes: Record<string, number>;
  updatedAt: number;
}

/** Long-term semantic memory item for Buddy conversations. */
export interface SemanticMemory {
  id: string;
  kind: "preference" | "fact" | "promise" | "context" | "other";
  text: string;
  importance: number;
  createdAt: number;
}

// ---------- Recommendations ----------

export interface RecommendationItem {
  /** AniList anime id — must exist in AniList; AI output is validated. */
  anilistId: number;
  reason: string;
  /** 0..1 confidence/fit score. */
  score: number;
}

export interface RecommendationRecord {
  id: string;
  /** What the user asked for / mode: "tonight" | "hidden-gem" | "surprise" | ... */
  context: string;
  items: RecommendationItem[];
  source: "local" | "ai";
  createdAt: number;
}

export type RecommendationFeedbackKind = "like" | "dislike" | "already_seen" | "not_for_me";

export interface RecommendationFeedback {
  id: string;
  recommendationId?: string;
  anilistId: number;
  feedback: RecommendationFeedbackKind;
  createdAt: number;
}

/** Permanently hidden title ("Not for me") — excluded from every rec surface. */
export interface HiddenAnime {
  /** AniList anime id (primary key). */
  anilistId: number;
  reason?: string;
  createdAt: number;
}

// ---------- Conversations ----------

export interface Conversation {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export type MessageRole = "user" | "assistant" | "system";

/** Structured card data attached to assistant messages — restored on reload. */
export interface MessagePayload {
  polish?: boolean;
  picks?: RecPick[];
  libraryConfirm?: {
    status: LibraryStatus;
    picks: RecPick[];
    progress?: number;
    reason?: string;
  };
  rateConfirm?: {
    score: number;
    picks: RecPick[];
  };
  actionConfirm?: {
    action: "favorite" | "unfavorite" | "remove" | "unrate" | "note" | "rewatch";
    picks: RecPick[];
    note?: string;
  };
  compare?: {
    a: AnimeSummary;
    b: AnimeSummary;
  };
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Rich cards (picks / confirms / compare) for assistant messages. */
  payload?: MessagePayload;
  createdAt: number;
}

// ---------- Spoilers ----------

export interface SpoilerState {
  /** AniList anime id (primary key). */
  anilistId: number;
  /** Highest episode the user has seen; Buddy hides spoilers past this. */
  maxEpisodeSeen: number;
  updatedAt: number;
}
