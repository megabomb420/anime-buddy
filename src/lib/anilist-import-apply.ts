/**
 * Write step of the AniList import (see anilist-import.ts for fetching).
 * Kept apart so the pure module stays testable under `node --test`
 * (the persistence chain is app-only).
 */

import { persistence } from "@/lib/db/persistence";
import type { AniListImportPreview } from "./anilist-import";

/** Write the preview to IndexedDB. AniList wins for ids the app already has. */
export async function applyAniListImport(
  preview: AniListImportPreview,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const total = preview.entries.length;
  let done = 0;
  for (const entry of preview.entries) {
    await persistence.cacheAnime(entry.anime);
    const existing = await persistence.getLibraryEntry(entry.anilistId);
    const written = await persistence.setLibraryStatus(entry.anilistId, entry.status, entry.progress);
    const rewatchCount = entry.rewatch
      ? Math.max(1, existing?.rewatchCount ?? 0)
      : (existing?.rewatchCount ?? written.rewatchCount);
    if (rewatchCount !== written.rewatchCount) {
      await persistence.restoreLibraryEntry({ ...written, rewatchCount });
    }
    if (entry.score !== undefined) {
      await persistence.setAnimeRating(entry.anilistId, entry.score);
    }
    done += 1;
    onProgress?.(done, total);
  }
}
