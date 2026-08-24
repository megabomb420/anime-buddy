/** Owner code — type it in Buddy chat to drop the persona lock. Toggle again to restore. */
export const PERSONA_UNLOCK_CODE = "deep7717";

const LS_KEY = "anime-buddy.persona-unlocked";

export function isPersonaUnlockCode(text: string): boolean {
  return text.trim().toLowerCase() === PERSONA_UNLOCK_CODE;
}

export function readUnlockCache(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeUnlockCache(on: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    if (on) localStorage.setItem(LS_KEY, "1");
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* private mode */
  }
}

export async function loadPersonaUnlocked(): Promise<boolean> {
  try {
    const { persistence } = await import("@/lib/db/persistence");
    const settings = await persistence.getSettings();
    if (settings.personaUnlocked) {
      writeUnlockCache(true);
      return true;
    }
  } catch {
    /* IndexedDB unavailable */
  }
  return readUnlockCache();
}

export async function setPersonaUnlocked(on: boolean): Promise<boolean> {
  writeUnlockCache(on);
  try {
    const { persistence } = await import("@/lib/db/persistence");
    await persistence.updateSettings({ personaUnlocked: on });
  } catch {
    /* still have localStorage */
  }
  return on;
}

export function unlockAck(on: boolean, polish: boolean): string {
  if (on) {
    return polish
      ? "Lock off. Pytaj o co chcesz — zostaje po zamknięciu apki. Wpisz kod jeszcze raz, żeby z powrotem zamknąć."
      : "Lock's off. Ask whatever — it stays after you close the app. Type the code again to lock it back.";
  }
  return polish
    ? "Lock z powrotem. Znowu tylko anime."
    : "Lock's back on. Anime lane only.";
}
