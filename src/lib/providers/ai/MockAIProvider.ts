/**
 * Mock AI provider — deterministic, offline, no network. Used for local
 * development and tests so the app works fully without the Worker or keys.
 */

import type {
  AIProvider,
  BuddyContext,
  ChatMessage,
  ExtractedTasteSignal,
  ImageAnalysisResult,
  RecommendationRequest,
  RankedRecommendation,
  TasteAnalysisInput,
} from "@/types/ai";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async chat(messages: ChatMessage[], _context?: BuddyContext): Promise<string> {
    const last = messages[messages.length - 1];
    return (
      `I'm Anime Buddy (mock mode — no AI key configured yet). You said: "${last?.content ?? ""}". ` +
      `Once the Cloudflare Worker is connected with a DeepSeek key, I'll answer with real taste-aware reasoning.`
    );
  }

  async recommend(request: RecommendationRequest): Promise<RankedRecommendation[]> {
    // Deterministic: rank candidates by AniList score descending, take top 3.
    return request.candidates
      .slice()
      .sort((a, b) => (b.anilistScore ?? 0) - (a.anilistScore ?? 0))
      .slice(0, 3)
      .map((c, i) => ({
        anilistId: c.anilistId,
        reason: `Mock pick #${i + 1}: highest AniList score (${c.anilistScore ?? "?"}) among your candidates.`,
        score: Math.max(0.1, 0.9 - i * 0.15),
      }));
  }

  async analyzeImage(_image: Blob): Promise<ImageAnalysisResult> {
    // Mock never pretends to recognize anything — low confidence by design.
    return { candidates: [], rawDescription: "Mock provider: image recognition unavailable." };
  }

  async analyzeTaste(input: TasteAnalysisInput): Promise<string> {
    const rated = input.ratings.length;
    const favs = input.favorites.length;
    if (rated === 0 && favs === 0) {
      return "Not enough data yet — rate a few anime or pick some favorites to build your taste profile.";
    }
    return `Mock taste summary: ${rated} ratings and ${favs} favorites recorded. Connect DeepSeek for a real interpretation.`;
  }

  async extractTasteSignals(text: string): Promise<ExtractedTasteSignal[]> {
    if (!text.trim()) return [];
    return [{ kind: "free-text", value: text.trim().slice(0, 120), weight: 0.2 }];
  }
}
