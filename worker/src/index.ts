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
 * Secrets (wrangler secret put ...):
 *   DEEPSEEK_API_KEY
 *   TMDB_API_KEY
 *
 * Local dev: copy wrangler.toml.example to wrangler.toml, fill vars, run
 * `npm run dev` in this directory.
 */

export interface Env {
  DEEPSEEK_API_KEY: string;
  TMDB_API_KEY: string;
  /** Comma-separated allowed origins for CORS, e.g. "http://localhost:3000". */
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
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
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
        return json({ ok: true, service: "anime-buddy-worker" }, { status: 200 }, cors);
      }

      // --- TMDB passthrough ---
      if (url.pathname.startsWith("/api/tmdb/")) {
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
            // Anime Lens. TODO: confirm DeepSeek multimodal endpoint/model at
            // integration time; if unavailable, swap this single route to a
            // vision-capable model without touching the frontend contract.
            // Contract: return {"candidates":[{"name":string,"kind":"anime"|
            // "character","confidence":number}], "rawDescription"?: string}.
            // The app resolves names against AniList — AI output is never
            // authoritative metadata.
            return json(
              { error: "vision route not yet wired to a multimodal model", candidates: [] },
              { status: 501 },
              cors,
            );
          }

          default:
            return json({ error: "not found" }, { status: 404 }, cors);
        }
      }

      return json({ error: "not found" }, { status: 404 }, cors);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      return json({ error: message }, { status: 500 }, cors);
    }
  },
};
