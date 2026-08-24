/**
 * AI provider contracts.
 *
 * DeepSeek is used ONLY for semantic reasoning and multimodal recognition —
 * never for factual anime metadata, filtering, sorting, availability, or
 * ratings. Those are deterministic TypeScript.
 *
 * All real AI calls go through the Cloudflare Worker so API keys are never
 * exposed in the frontend.
 */

import type { AnimeSummary } from "./anime";
import type { MessageRole, RecommendationItem } from "./entities";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** Context Buddy can use in conversation (taste summary, spoiler state...). */
export interface BuddyContext {
  tasteSummary?: string;
  characterSummary?: string;
  spoilerLimits?: Array<{ anilistId: number; maxEpisodeSeen: number }>;
  region?: string;
  /** Titles already resolved from the catalog — Buddy must not invent others. */
  catalogPicks?: Array<{
    title: string;
    genres: string[];
    anilistId?: number;
    coverImage?: string;
  }>;
  /** Compact AniList dump for this turn. Ren may state these as fact. */
  catalogFacts?: string;
  /** Short "Title (status)" list from the local library. */
  libraryBrief?: string;
}

export interface HardConstraints {
  /** Only include titles at/below this age guide. */
  maxAge?: number;
  /** Exclude these AniList ids (e.g. already in library). */
  excludeAnilistIds?: number[];
  /** Free-text constraints extracted from the request. */
  mustBeOnCrunchyroll: boolean;
  region: string;
}

export interface RecommendationRequest {
  /** The user's natural-language request. */
  query: string;
  /**
   * Candidate pool (typically 10–30) produced by the deterministic pipeline.
   * NEVER send the complete anime database to the model.
   */
  candidates: AnimeSummary[];
  hardConstraints: HardConstraints;
  tasteSummary?: string;
}

export type RankedRecommendation = RecommendationItem;

export interface ExtractedTasteSignal {
  kind: "genre" | "tag" | "theme" | "character-archetype" | "free-text";
  value: string;
  /** -1..1 */
  weight: number;
}

export interface TasteAnalysisInput {
  ratings: Array<{ anilistId: number; title: string; score: number }>;
  favorites: string[];
  notes: string[];
}

export interface ImageCandidate {
  /** Name as recognized; must be resolved against AniList before use. */
  name: string;
  kind: "anime" | "character";
  /** 0..1 — if low, show multiple possible matches to the user. */
  confidence: number;
}

export interface ImageAnalysisResult {
  candidates: ImageCandidate[];
  rawDescription?: string;
  recognition?: VisualRecognitionResult;
}

export type VisualObjectType = "figurine" | "character_art" | "merchandise" | "manga" | "unknown";

/** Structured multimodal recognition. AI identifies; the catalog is canonical. */
export interface VisualRecognitionResult {
  detected: boolean;
  objectType?: VisualObjectType;
  characterName?: string;
  franchiseTitle?: string;
  animeTitle?: string;
  /** 0..1. Low values must be shown as uncertain — never implied as fact. */
  confidence?: number;
  alternatives?: Array<{
    characterName?: string;
    animeTitle?: string;
    confidence?: number;
  }>;
  reasoningSummary?: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], context?: BuddyContext): Promise<string>;
  recommend(request: RecommendationRequest): Promise<RankedRecommendation[]>;
  analyzeImage(image: Blob): Promise<ImageAnalysisResult>;
  analyzeTaste(input: TasteAnalysisInput): Promise<string>;
  extractTasteSignals(text: string): Promise<ExtractedTasteSignal[]>;
}
