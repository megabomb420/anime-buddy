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
import { mockBuddyReply } from "@/lib/buddy/persona";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async chat(messages: ChatMessage[], context?: BuddyContext): Promise<string> {
    const last = messages[messages.length - 1];
    return mockBuddyReply(last?.content ?? "", context);
  }

  async recommend(request: RecommendationRequest): Promise<RankedRecommendation[]> {
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
    return {
      candidates: [],
      rawDescription: "Mock provider: image recognition unavailable.",
      recognition: { detected: false, reasoningSummary: "Mock mode cannot identify photos." },
    };
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
