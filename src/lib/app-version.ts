/** Build-time identity of this PWA install. */

export const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || "0.0.0-dev";

export const APP_COMMIT =
  (import.meta.env.VITE_GIT_SHA as string | undefined)?.trim() || "local";

export const APP_BUILT_AT =
  (import.meta.env.VITE_BUILD_TIME as string | undefined)?.trim() || "";

export interface RemoteVersion {
  version: string;
  commit: string;
  builtAt?: string;
}

export type VersionCheck =
  | { status: "loading" }
  | { status: "latest"; latest: RemoteVersion }
  | { status: "update"; latest: RemoteVersion }
  | { status: "unknown" };

function versionUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}version.json?t=${Date.now()}`;
}

/** Compare this build to the version.json published with the latest Pages deploy. */
export async function checkForUpdate(): Promise<VersionCheck> {
  try {
    const res = await fetch(versionUrl(), { cache: "no-store" });
    if (!res.ok) return { status: "unknown" };
    const data = (await res.json()) as Partial<RemoteVersion>;
    if (!data.version && !data.commit) return { status: "unknown" };
    const latest: RemoteVersion = {
      version: String(data.version ?? ""),
      commit: String(data.commit ?? ""),
      builtAt: data.builtAt ? String(data.builtAt) : undefined,
    };

    const sameCommit =
      latest.commit &&
      APP_COMMIT !== "local" &&
      latest.commit.startsWith(APP_COMMIT.slice(0, 7));
    const sameVersion = latest.version && latest.version === APP_VERSION;

    if (sameCommit || (sameVersion && !latest.commit)) {
      return { status: "latest", latest };
    }
    if (latest.commit && APP_COMMIT !== "local" && latest.commit !== APP_COMMIT) {
      return { status: "update", latest };
    }
    if (latest.version && latest.version !== APP_VERSION) {
      return { status: "update", latest };
    }
    return { status: "latest", latest };
  } catch {
    return { status: "unknown" };
  }
}
