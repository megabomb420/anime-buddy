/** Client-side spam / flood guard for Buddy chat + Library confirms. */

const MSG_WINDOW_MS = 60_000;
const MSG_MAX_IN_WINDOW = 12;
const MSG_MIN_GAP_MS = 450;

const CONFIRM_WINDOW_MS = 60_000;
const CONFIRM_MAX_IN_WINDOW = 8;

const REPEAT_WINDOW_MS = 30_000;
const REPEAT_MAX = 3;

const COOLDOWN_MS = 25_000;

export type SpamReason =
  | "rate"
  | "gap"
  | "repeat"
  | "gibberish"
  | "confirm_rate"
  | "cooldown";

export interface SpamVerdict {
  ok: boolean;
  reason?: SpamReason;
  retryAfterMs?: number;
}

interface SpamState {
  msgTimes: number[];
  confirmTimes: number[];
  recentTexts: Array<{ at: number; key: string }>;
  cooldownUntil: number;
}

const state: SpamState = {
  msgTimes: [],
  confirmTimes: [],
  recentTexts: [],
  cooldownUntil: 0,
};

function now() {
  return Date.now();
}

function prune(times: number[], windowMs: number, t: number) {
  return times.filter((x) => t - x < windowMs);
}

function normalizeKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Repeated chars / keyboard smash / empty noise. */
export function isGibberish(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2) return true;
  if (t.length > 500) return true;

  const letters = t.replace(/\s/g, "");
  if (letters.length >= 6 && /^(.)\1+$/u.test(letters)) return true;
  if (/(.)\1{5,}/u.test(t)) return true;

  // Mostly non-letter noise
  const alnum = (t.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (t.length >= 8 && alnum / t.length < 0.35) return true;

  // asdf-style runs without vowels (latin)
  const compact = letters.toLowerCase();
  if (
    compact.length >= 10 &&
    /^[bcdfghjklmnpqrstvwxyz]+$/i.test(compact) &&
    !/[aeiouyąęó]/i.test(compact)
  ) {
    return true;
  }

  return false;
}

function enterCooldown(t: number, reason: SpamReason): SpamVerdict {
  state.cooldownUntil = Math.max(state.cooldownUntil, t + COOLDOWN_MS);
  return { ok: false, reason, retryAfterMs: state.cooldownUntil - t };
}

/** Call before processing a user chat message. */
export function checkMessageSpam(text: string): SpamVerdict {
  const t = now();

  if (t < state.cooldownUntil) {
    return { ok: false, reason: "cooldown", retryAfterMs: state.cooldownUntil - t };
  }

  if (isGibberish(text)) {
    return enterCooldown(t, "gibberish");
  }

  state.msgTimes = prune(state.msgTimes, MSG_WINDOW_MS, t);
  if (state.msgTimes.length >= MSG_MAX_IN_WINDOW) {
    return enterCooldown(t, "rate");
  }

  const last = state.msgTimes[state.msgTimes.length - 1];
  if (last !== undefined && t - last < MSG_MIN_GAP_MS) {
    return { ok: false, reason: "gap", retryAfterMs: MSG_MIN_GAP_MS - (t - last) };
  }

  const key = normalizeKey(text);
  state.recentTexts = state.recentTexts.filter((x) => t - x.at < REPEAT_WINDOW_MS);
  const same = state.recentTexts.filter((x) => x.key === key).length;
  if (same >= REPEAT_MAX) {
    return enterCooldown(t, "repeat");
  }

  state.msgTimes.push(t);
  state.recentTexts.push({ at: t, key });
  return { ok: true };
}

/** Call before each Library confirm write. */
export function checkConfirmSpam(): SpamVerdict {
  const t = now();

  if (t < state.cooldownUntil) {
    return { ok: false, reason: "cooldown", retryAfterMs: state.cooldownUntil - t };
  }

  state.confirmTimes = prune(state.confirmTimes, CONFIRM_WINDOW_MS, t);
  if (state.confirmTimes.length >= CONFIRM_MAX_IN_WINDOW) {
    return enterCooldown(t, "confirm_rate");
  }

  state.confirmTimes.push(t);
  return { ok: true };
}

export function spamReply(reason: SpamReason, polish: boolean): string {
  if (polish) {
    switch (reason) {
      case "gibberish":
        return "To wygląda na spam, nie na tytuł. Napisz normalnie.";
      case "repeat":
        return "To samo z rzędu — zwolnij. Jedna wiadomość wystarczy.";
      case "rate":
      case "gap":
      case "confirm_rate":
      case "cooldown":
        return "Za szybko. Daj chwilę, potem wracamy do anime.";
    }
  }
  switch (reason) {
    case "gibberish":
      return "That looks like noise, not a title. Try a real message.";
    case "repeat":
      return "Same line again — slow down. One message is enough.";
    case "rate":
    case "gap":
    case "confirm_rate":
    case "cooldown":
      return "Too fast. Give it a second, then we're back on anime.";
  }
}

/** Test helper — reset in-memory counters. */
export function __resetSpamStateForTests() {
  state.msgTimes = [];
  state.confirmTimes = [];
  state.recentTexts = [];
  state.cooldownUntil = 0;
}
