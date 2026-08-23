/**
 * Runtime configuration.
 * No secrets belong here: private API keys live ONLY in the Cloudflare Worker.
 * The Worker URL may come from VITE_WORKER_URL or a browser override (Profile).
 */

import { getWorkerUrl } from "@/lib/worker-gateway";

export const config = {
  /** Base URL of the Anime Buddy Cloudflare Worker. */
  get workerUrl(): string {
    return getWorkerUrl();
  },
  /** "deepseek" whenever a Worker URL is set; otherwise the Vite default. */
  get aiProvider(): "mock" | "deepseek" {
    if (getWorkerUrl()) return "deepseek";
    return import.meta.env.VITE_AI_PROVIDER === "deepseek" ? "deepseek" : "mock";
  },
  defaultRegion: "IE" as const,
};
