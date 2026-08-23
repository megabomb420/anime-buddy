/**
 * Anime Buddy Cloudflare Worker.
 *
 * Purpose: keep private API keys (DeepSeek, TMDB) off the client.
 * This is deliberately SMALL and application-specific — it is NOT the main
 * backend. All user data stays local in IndexedDB.
 *
 * Routes:
 *   GET  /api/health            — liveness check
 *   POST /api/ai/chat           — DeepSeek chat (Buddy conversations)
 *   POST /api/ai/recommend      — DeepSeek semantic reranking of candidates
 *   POST /api/ai/taste          — DeepSeek taste-profile interpretation
 *   POST /api/ai/signals        — DeepSeek taste-signal extraction from notes
 *   POST /api/ai/vision         — DeepSeek multimodal (Anime Lens)
 *   GET  /api/tmdb/*            — TMDB passthrough with secret key
 *
 * Secrets: Cloudflare dashboard → Settings → Variables and Secrets
 *   DEEPSEEK_API_KEY
 *   TMDB_API_KEY
 *
 * wrangler.toml is committed (no secrets). Deploy from this folder.
 */

export interface Env {
  DEEPSEEK_API_KEY?: string;
  TMDB_API_KEY?: string;
  /** Comma-separated allowed origins for CORS, e.g. "*". */
  ALLOWED_ORIGINS?: string;
}

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const TMDB_URL = "https://api.themoviedb.org/3";

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim());
  const allowOrigin = allowed.includes("*") || allowed.includes(origin) ? origin || "*" : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, init: ResponseInit, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...cors, ...(init.headers ?? {}) },
  });
}

function requireDeepSeekKey(env: Env): string {
  if (!env.DEEPSEEK_API_KEY) throw new Error("not_configured");
  return env.DEEPSEEK_API_KEY;
}

/** Call DeepSeek chat completions with a system+user message pair. */
async function deepseekChat(
  env: Env,
  system: string,
  user: string,
  jsonMode = false,
): Promise<string> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireDeepSeekKey(env)}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

const VISION_SYSTEM =
  "You identify anime figurines, character artwork, manga covers, and merchandise in photographs. " +
  "Return ONLY JSON: {\"detected\":boolean,\"objectType\":\"figurine\"|\"character_art\"|\"merchandise\"|\"manga\"|\"unknown\"," +
  "\"characterName\":string|null,\"franchiseTitle\":string|null,\"animeTitle\":string|null,\"confidence\":number," +
  "\"alternatives\":[{\"characterName\":string|null,\"animeTitle\":string|null,\"confidence\":number}]," +
  "\"reasoningSummary\":string}. Never invent titles. If uncertain, lower confidence and fill alternatives. " +
  "If not anime-related, detected=false. Do not mention streaming, scores, or age ratings.";

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

async function deepseekVision(
  env: Env,
  imageBase64: string,
): Promise<{
  candidates: Array<{ name: string; kind: "anime" | "character"; confidence: number }>;
  rawDescription?: string;
  recognition: Record<string, unknown>;
}> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireDeepSeekKey(env)}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash-vision-exp",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: "system", content: VISION_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the anime figurine, character, or merchandise. JSON only." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek vision HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const recognition = extractJsonObject(content);
  const candidates: Array<{ name: string; kind: "anime" | "character"; confidence: number }> = [];
  const character = typeof recognition.characterName === "string" ? recognition.characterName : "";
  const anime = typeof recognition.animeTitle === "string" ? recognition.animeTitle : "";
  const conf = typeof recognition.confidence === "number" ? recognition.confidence : 0;
  if (character) candidates.push({ name: character, kind: "character", confidence: conf });
  if (anime) candidates.push({ name: anime, kind: "anime", confidence: conf });
  return {
    candidates,
    rawDescription: typeof recognition.reasoningSummary === "string" ? recognition.reasoningSummary : content,
    recognition,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // --- health ---
      if (url.pathname === "/api/health") {
        return json(
          {
            ok: true,
            service: "anime-buddy-worker",
            vision: Boolean(env.DEEPSEEK_API_KEY),
            tmdb: Boolean(env.TMDB_API_KEY),
          },
          { status: 200 },
          cors,
        );
      }

      // --- TMDB passthrough ---
      if (url.pathname.startsWith("/api/tmdb/")) {
        if (!env.TMDB_API_KEY) {
          return json({ error: "not_configured" }, { status: 503 }, cors);
        }
        const path = url.pathname.slice("/api/tmdb".length);
        const target = new URL(`${TMDB_URL}${path}${url.search}`);
        target.searchParams.set("api_key", env.TMDB_API_KEY);
        const upstream = await fetch(target.toString(), {
          headers: { Accept: "application/json" },
        });
        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      // --- AI routes ---
      if (url.pathname.startsWith("/api/ai/") && request.method === "POST") {
        if (!env.DEEPSEEK_API_KEY) {
          return json(
            { error: "not_configured", candidates: [], recognition: { detected: false } },
            { status: 503 },
            cors,
          );
        }
        const body = (await request.json()) as Record<string, unknown>;

        switch (url.pathname) {
          case "/api/ai/chat": {
            const messages = (body.messages ?? []) as Array<{ role: string; content: string }>;
            const context = (body.context ?? {}) as { tasteSummary?: string };
            const system =
              "You are Anime Buddy, a warm, knowledgeable anime friend. You recommend only anime " +
              "the user can actually watch, respect spoiler limits, and never invent facts about anime. " +
              (context.tasteSummary ? `User taste profile: ${context.tasteSummary}` : "");
            const reply = await deepseekChat(
              env,
              system,
              messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
            );
            return json({ reply }, { status: 200 }, cors);
          }

          case "/api/ai/recommend": {
            const system =
              "You are the Anime Buddy reranker. Given a small candidate list (JSON) and a user " +
              "request, pick the best 3. Return ONLY JSON: {\"items\":[{\"anilistId\":number," +
              "\"reason\":string,\"score\":number}]}. Use only anilistId values from the input. " +
              "Never invent titles or ids.";
            const reply = await deepseekChat(env, system, JSON.stringify(body), true);
            const parsed = JSON.parse(reply) as { items?: unknown[] };
            return json({ items: parsed.items ?? [] }, { status: 200 }, cors);
          }

          case "/api/ai/taste": {
            const system =
              "You interpret an anime fan's taste from their ratings, favorites and notes. " +
              "Write a short, warm, specific 'Taste DNA' summary (max 120 words). " +
              "Return ONLY JSON: {\"summary\": string}.";
            const reply = await deepseekChat(env, system, JSON.stringify(body), true);
            const parsed = JSON.parse(reply) as { summary?: string };
            return json({ summary: parsed.summary ?? "" }, { status: 200 }, cors);
          }

          case "/api/ai/signals": {
            const system =
              "Extract taste signals from a user's note about anime. Return ONLY JSON: " +
              "{\"signals\":[{\"kind\":\"genre\"|\"tag\"|\"theme\"|\"character-archetype\"|" +
              "\"free-text\",\"value\":string,\"weight\":number}]}. Weight is -1..1.";
            const reply = await deepseekChat(env, system, String(body.text ?? ""), true);
            const parsed = JSON.parse(reply) as { signals?: unknown[] };
            return json({ signals: parsed.signals ?? [] }, { status: 200 }, cors);
          }

          case "/api/ai/vision": {
            const imageBase64 = String(body.imageBase64 ?? "").replace(
              /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
              "",
            );
            if (!imageBase64) {
              return json({ error: "imageBase64 required", candidates: [] }, { status: 400 }, cors);
            }
            if (imageBase64.length > 5_500_000) {
              return json({ error: "payload_too_large", candidates: [] }, { status: 413 }, cors);
            }
            const vision = await deepseekVision(env, imageBase64);
            return json(vision, { status: 200 }, cors);
          }

          default:
            return json({ error: "not found" }, { status: 404 }, cors);
        }
      }

      return json({ error: "not found" }, { status: 404 }, cors);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      const status = message === "not_configured" ? 503 : 500;
      return json({ error: message }, { status }, cors);
    }
  },
};
