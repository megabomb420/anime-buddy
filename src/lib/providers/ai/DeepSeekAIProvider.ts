/**
 * DeepSeek AI provider — talks ONLY to the Cloudflare Worker. The DeepSeek
 * API key is a Worker secret and never reaches the frontend.
 *
 * DeepSeek is used exclusively for semantic reasoning:
 *   conversation, recommendation reranking, taste interpretation,
 *   character similarity, semantic memory, taste-signal extraction,
 *   image recognition. It never produces factual anime metadata.
 */

import { config } from "@/lib/config";
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

export class DeepSeekAIProvider implements AIProvider {
  readonly name = "deepseek";

  private get base(): string {
    if (!config.workerUrl) {
      throw new Error("VITE_WORKER_URL is not configured — DeepSeek requires the Cloudflare Worker");
    }
    return `${config.workerUrl.replace(/\/$/, "")}/api/ai`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Worker AI ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async chat(messages: ChatMessage[], context?: BuddyContext): Promise<string> {
    const out = await this.post<{ reply: string }>("/chat", { messages, context });
    return out.reply;
  }

  async recommend(request: RecommendationRequest): Promise<RankedRecommendation[]> {
    // The candidate pool is already small (10–30) by the time we get here.
    const out = await this.post<{ items: RankedRecommendation[] }>("/recommend", {
      query: request.query,
      hardConstraints: request.hardConstraints,
      tasteSummary: request.tasteSummary,
      candidates: request.candidates.map((c) => ({
        anilistId: c.anilistId,
        title: c.title.english ?? c.title.romaji,
        genres: c.genres,
        tags: c.tags.slice(0, 8),
        anilistScore: c.anilistScore,
        synopsis: c.synopsis?.slice(0, 400),
      })),
    });
    return out.items;
  }

  async analyzeImage(image: Blob): Promise<ImageAnalysisResult> {
    // Resize/compress locally before upload (Anime Lens flow).
    const compressed = await compressImage(image, 1024, 0.8);
    const base64 = await blobToBase64(compressed);
    return this.post<ImageAnalysisResult>("/vision", { imageBase64: base64 });
  }

  async analyzeTaste(input: TasteAnalysisInput): Promise<string> {
    const out = await this.post<{ summary: string }>("/taste", input);
    return out.summary;
  }

  async extractTasteSignals(text: string): Promise<ExtractedTasteSignal[]> {
    const out = await this.post<{ signals: ExtractedTasteSignal[] }>("/signals", { text });
    return out.signals;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Downscale + re-encode before sending to the Worker (bandwidth + privacy). */
async function compressImage(image: Blob, maxDim: number, quality: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return image;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob ?? image;
  } catch {
    return image; // fall back to the original if canvas processing fails
  }
}
