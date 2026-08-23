import { providers } from "@/lib/providers";
import { getWorkerUrl } from "@/lib/worker-gateway";
import {
  guardReply,
  isJailbreakAttempt,
  lockedReply,
  looksPolish,
  mockBuddyReply,
  sanitizeMessages,
} from "@/lib/buddy/persona";
import type { BuddyContext, ChatMessage } from "@/types/ai";

/**
 * Single door into Buddy chat. Persona lock runs locally first, then again
 * on the Cloudflare Worker (DeepSeek — same key as Scan).
 */
export async function replyAsBuddy(
  messages: ChatMessage[],
  context?: BuddyContext,
): Promise<string> {
  const clean = sanitizeMessages(messages);
  const last = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
  if (isJailbreakAttempt(last)) return lockedReply(last);

  if (getWorkerUrl()) {
    try {
      const raw = await providers.ai.chat(clean, context);
      return guardReply(raw, last);
    } catch {
      return looksPolish(last)
        ? "DeepSeek milczy. Sprawdź Workera w Profilu — ten sam co Scan."
        : "DeepSeek went quiet. Check the Worker in Profile — same one Scan uses.";
    }
  }

  return mockBuddyReply(last, context);
}
