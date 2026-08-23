/**
 * VisionService — camera recognition pipeline (GitHub / Vite PWA).
 *
 *   capture → compress → Worker POST /api/ai/vision (DeepSeek V4 Flash)
 *   → structured result → AniList catalog resolution
 *
 * The model never becomes the catalog. Titles/names are search queries only.
 */

import { compressImage, blobToBase64 } from "@/lib/image/compress";
import { config } from "@/lib/config";
import { titleSimilarity } from "@/lib/text-match";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import type { VisualRecognitionResult } from "@/types/ai";
import type { AnimeSummary, CharacterSummary } from "@/types/anime";

export type VisionGatewayError =
  | "not_configured"
  | "provider_error"
  | "timeout"
  | "invalid_response"
  | "payload_too_large";

export type ScanConfidenceBand = "high" | "likely" | "ambiguous" | "none";

export interface CatalogMatch {
  anime: AnimeSummary;
  character?: CharacterSummary;
  score: number;
  via: "anime-title" | "franchise" | "character";
}

export interface ScanOutcome {
  recognition: VisualRecognitionResult;
  matches: CatalogMatch[];
  band: ScanConfidenceBand;
  gatewayError?: VisionGatewayError;
  gatewayMessage?: string;
}

function uniqueQueries(recognition: VisualRecognitionResult): string[] {
  const raw = [
    recognition.animeTitle,
    recognition.franchiseTitle,
    recognition.characterName,
    ...(recognition.alternatives ?? []).flatMap((a) => [a.animeTitle, a.characterName]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of raw) {
    const t = q?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 6);
}

function bandFor(recognition: VisualRecognitionResult, matches: CatalogMatch[]): ScanConfidenceBand {
  if (!recognition.detected && matches.length === 0) return "none";
  if (matches.length === 0) return "none";
  const top = matches[0]?.score ?? 0;
  const second = matches[1]?.score ?? 0;
  const conf = recognition.confidence ?? 0;
  if (matches.length > 1 && Math.abs(top - second) < 0.08 && top < 0.9) return "ambiguous";
  if (conf >= 0.75 && top >= 0.55) return "high";
  if (conf >= 0.4 || top >= 0.45) return "likely";
  return "ambiguous";
}

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.toLowerCase() !== "null" ? s : undefined;
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.min(1, Math.max(0, n));
}

function coerceRecognition(raw: unknown): VisualRecognitionResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const altsRaw = Array.isArray(obj.alternatives) ? obj.alternatives : [];
  const objectType = ["figurine", "character_art", "merchandise", "manga", "unknown"].includes(
    String(obj.objectType),
  )
    ? (obj.objectType as VisualRecognitionResult["objectType"])
    : undefined;
  return {
    detected: obj.detected === true,
    objectType,
    characterName: asString(obj.characterName),
    franchiseTitle: asString(obj.franchiseTitle),
    animeTitle: asString(obj.animeTitle),
    confidence: clamp01(obj.confidence),
    alternatives: altsRaw
      .slice(0, 4)
      .map((a) => {
        const row = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
        return {
          characterName: asString(row.characterName),
          animeTitle: asString(row.animeTitle),
          confidence: clamp01(row.confidence),
        };
      })
      .filter((a) => a.characterName || a.animeTitle),
    reasoningSummary: asString(obj.reasoningSummary),
  };
}

async function callWorkerVision(imageBase64: string): Promise<{
  ok: true;
  result: VisualRecognitionResult;
} | {
  ok: false;
  error: VisionGatewayError;
  message: string;
}> {
  const url = `${config.workerUrl.replace(/\/$/, "")}/api/ai/vision`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
    signal: AbortSignal.timeout(26000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 503 || body.error === "not_configured") {
    return {
      ok: false,
      error: "not_configured",
      message: "The Worker is up, but DeepSeek isn’t on it yet. In Cloudflare: Worker → Settings → Variables and Secrets → add a Secret named DEEPSEEK_API_KEY.",
    };
  }
  if (!res.ok) {
    const message = typeof body.error === "string" ? body.error : `Vision HTTP ${res.status}`;
    if (/timeout|aborted/i.test(message)) {
      return { ok: false, error: "timeout", message: "Vision timed out. Try a closer photo." };
    }
    return { ok: false, error: "provider_error", message };
  }
  return { ok: true, result: coerceRecognition(body.recognition ?? body) };
}

export async function resolveRecognition(recognition: VisualRecognitionResult): Promise<CatalogMatch[]> {
  const queries = uniqueQueries(recognition);
  if (queries.length === 0) return [];
  const byId = new Map<number, CatalogMatch>();

  await Promise.all(
    queries.map(async (q) => {
      try {
        const animeHits = await animeCatalogService.search(q, 6);
        for (const anime of animeHits) {
          const vsAnime = Math.max(
            titleSimilarity(q, anime.title.english ?? ""),
            titleSimilarity(q, anime.title.romaji),
            titleSimilarity(q, anime.title.native ?? ""),
          );
          const score = Math.max(0.15, vsAnime);
          const prev = byId.get(anime.anilistId);
          if (!prev || score > prev.score) {
            byId.set(anime.anilistId, { anime, score, via: "anime-title" });
          }
        }
      } catch {
        /* catalog miss is fine */
      }
    }),
  );

  if (recognition.characterName) {
    try {
      const chars = await animeCatalogService.searchCharacters(recognition.characterName, 6);
      for (const character of chars) {
        const nameScore = titleSimilarity(recognition.characterName, character.name);
        for (const id of character.animeIds.slice(0, 3)) {
          let anime = byId.get(id)?.anime;
          if (!anime) anime = (await animeCatalogService.getAnime(id)) ?? undefined;
          if (!anime) continue;
          const score = Math.max(nameScore, byId.get(id)?.score ?? 0);
          byId.set(id, { anime, character, score, via: "character" });
        }
      }
    } catch {
      /* character search optional */
    }
  }

  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function analyzeCapture(image: Blob): Promise<ScanOutcome> {
  const compressed = await compressImage(image, 1280, 0.82);
  const imageBase64 = await blobToBase64(compressed);

  let recognition: VisualRecognitionResult = { detected: false };
  let gatewayError: VisionGatewayError | undefined;
  let gatewayMessage: string | undefined;

  if (!config.workerUrl) {
    gatewayError = "not_configured";
    gatewayMessage =
      "Scan talks to your Cloudflare Worker. Open Profile and paste the workers.dev URL after you add the DeepSeek secret there.";
  } else {
    try {
      const response = await callWorkerVision(imageBase64);
      if (response.ok) recognition = response.result;
      else {
        gatewayError = response.error;
        gatewayMessage = response.message;
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        gatewayError = "timeout";
        gatewayMessage = "Vision timed out. Try a closer photo.";
      } else {
        gatewayError = "provider_error";
        gatewayMessage = "Could not reach the vision gateway. Check your connection.";
      }
    }
  }

  const shouldResolve =
    !gatewayError && Boolean(recognition.detected || recognition.animeTitle || recognition.characterName);
  const matches = shouldResolve ? await resolveRecognition(recognition) : [];

  return {
    recognition,
    matches,
    band: bandFor(recognition, matches),
    gatewayError,
    gatewayMessage,
  };
}
