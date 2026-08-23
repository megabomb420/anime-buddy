/**
 * Runtime configuration.
 * No secrets belong here: private API keys live ONLY in the Cloudflare Worker.
 * Scan + Buddy use the baked-in Worker URL; Profile can override it.
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
