/**
 * Session recap for long Buddy chats.
 *
 * `sanitizeMessages()` in persona.ts keeps only the last MAX_TURNS (12)
 * messages — without this, everything older silently disappears and Ren
 * forgets what the user logged, rated, or asked for. Here the dropped turns
 * are condensed into ONE synthetic recap message, so the Worker still gets
 * the context at a flat token cost (recap + 11 recent = 12 messages max).
 *
 * Fully deterministic: the recap only echoes what the existing intent
 * parsers already understood from the user's own messages. It never invents
 * titles, scores, episodes, or any other catalog facts.
 */

import { parseBuddyWriteIntent } from "./buddy-library.ts";
import { parseLookupQuery } from "./catalog-search.ts";
import { wantsRecommendation } from "./buddy-intent.ts";
import type { ChatMessage } from "../types/ai.ts";

/** Matches MAX_TURNS in src/lib/buddy/persona.ts. */
export const SESSION_MAX_MESSAGES = 12;

/** Recent messages kept verbatim when a recap is prepended (recap + 11 = 12). */
export const SESSION_KEEP_RECENT = SESSION_MAX_MESSAGES - 1;

const RECAP_MAX_CHARS = 700;

const STATUS_LABEL: Record<string, string> = {
  watching: "watching",
  completed: "completed",
  plan_to_watch: "plan to watch",
  on_hold: "on hold",
  dropped: "dropped",
};

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Condense older user turns into a compact recap. Only user messages carry
 * intent; assistant replies add no durable facts the user did not trigger.
 * Returns "" when nothing parseable was said (caller falls back to a plain
 * tail cut).
 */
export function summarizeSessionTurns(messages: ChatMessage[]): string {
  const logged: string[] = [];
  const rated: string[] = [];
  const lookups: string[] = [];
  const recAsks: string[] = [];

  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = m.content.trim();
    if (!text) continue;

    const write = parseBuddyWriteIntent(text);
    if (write?.kind === "library") {
      const titles = write.titles.length ? write.titles : [write.query];
      const label = STATUS_LABEL[write.status] ?? write.status;
      const progress = write.progress != null ? `, ep ${write.progress}` : "";
      logged.push(`${titles.join(", ")} → ${label}${progress}`);
      continue;
    }
    if (write?.kind === "rate") {
      const titles = write.titles.length ? write.titles : [write.query];
      rated.push(`${titles.join(", ")} → ${write.score}/10`);
      continue;
    }

    const lookup = parseLookupQuery(text);
    if (lookup) {
      lookups.push(lookup);
      continue;
    }

    if (wantsRecommendation(text)) {
      recAsks.push(text.slice(0, 60));
    }
  }

  const parts: string[] = [];
  if (logged.length) parts.push(`Logged: ${dedupe(logged).join("; ")}.`);
  if (rated.length) parts.push(`Rated: ${dedupe(rated).join("; ")}.`);
  if (lookups.length) parts.push(`Looked up: ${dedupe(lookups).join(", ")}.`);
  if (recAsks.length) {
    parts.push(`Rec asks: ${dedupe(recAsks).slice(-3).map((q) => `“${q}”`).join("; ")}.`);
  }
  return parts.join(" ").slice(0, RECAP_MAX_CHARS);
}

/**
 * Build the message list sent to the Worker for a CHAT turn. Short chats
 * pass through untouched; long chats get older turns replaced by a single
 * recap message so the total never exceeds SESSION_MAX_MESSAGES.
 */
export function buildSessionHistory(all: ChatMessage[]): ChatMessage[] {
  const clean = all.filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
  );
  if (clean.length <= SESSION_MAX_MESSAGES) return clean.slice(-SESSION_MAX_MESSAGES);

  const recent = clean.slice(-SESSION_KEEP_RECENT);
  const recap = summarizeSessionTurns(clean.slice(0, -SESSION_KEEP_RECENT));
  if (!recap) return clean.slice(-SESSION_MAX_MESSAGES);

  return [{ role: "user", content: `[Earlier in this chat — recap] ${recap}` }, ...recent];
}
