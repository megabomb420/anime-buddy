/**
 * Runtime configuration. All values come from Vite env vars — see
 * .env.example. No secrets belong here: private API keys live ONLY in the
 * Cloudflare Worker.
 */

export const config = {
  /** Base URL of the Anime Buddy Cloudflare Worker, e.g. https://anime-buddy-worker.<sub>.workers.dev */
  workerUrl: import.meta.env.VITE_WORKER_URL ?? "",
  /** Which AI provider to use: "mock" (default, offline dev) or "deepseek" (via Worker). */
  aiProvider: (import.meta.env.VITE_AI_PROVIDER ?? "mock") as "mock" | "deepseek",
  /** Default availability / certification region. */
  defaultRegion: "IE",
} as const;
