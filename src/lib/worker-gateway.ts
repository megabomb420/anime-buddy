/**
 * Cloudflare Worker URL.
 * The DeepSeek key never lives here; it stays a Worker secret.
 * Scan + Buddy use the baked-in Worker unless Profile overrides it.
 */

const STORAGE_KEY = "anime-buddy.worker-url";

/** Public Worker origin. Not a secret. */
export const DEFAULT_WORKER_URL = "https://anime-buddy-worker.whip-blanket.workers.dev";

export type WorkerHealth = {
  ok: boolean;
  vision: boolean;
  tmdb: boolean;
  service?: string;
  error?: string;
};

function envWorkerUrl(): string {
  const raw = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
  return raw.replace(/\/$/, "").trim();
}

export function normalizeWorkerUrl(raw: string): string {
  let t = raw.trim();
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

export function getStoredWorkerUrl(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return normalizeWorkerUrl(localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

export function setStoredWorkerUrl(url: string): string {
  const cleaned = normalizeWorkerUrl(url);
  if (typeof localStorage === "undefined") return cleaned;
  try {
    if (!cleaned) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    /* private mode */
  }
  return cleaned;
}

export function getWorkerUrl(): string {
  return getStoredWorkerUrl() || envWorkerUrl() || DEFAULT_WORKER_URL;
}

export async function probeWorker(url: string): Promise<WorkerHealth> {
  const base = normalizeWorkerUrl(url);
  if (!base) {
    return {
      ok: false,
      vision: false,
      tmdb: false,
      error: "Paste a Worker URL like https://anime-buddy-worker.yourname.workers.dev",
    };
  }
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, vision: false, tmdb: false, error: `Worker HTTP ${res.status}` };
    }
    return {
      ok: true,
      vision: body.vision === true,
      tmdb: body.tmdb === true,
      service: typeof body.service === "string" ? body.service : undefined,
    };
  } catch {
    return {
      ok: false,
      vision: false,
      tmdb: false,
      error: "Could not reach that Worker. Check the URL, then make sure the Worker is deployed.",
    };
  }
}
