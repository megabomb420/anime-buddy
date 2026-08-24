import { providers } from "@/lib/providers";
import { getWorkerUrl } from "@/lib/worker-gateway";
import {
  blockUser,
  guardReply,
  looksPolish,
  mockBuddyReply,
  sanitizeMessages,
} from "@/lib/buddy/persona";
import { typeFromChunks, typeOut } from "@/lib/buddy-type";
import { isPersonaUnlockCode, PERSONA_UNLOCK_CODE } from "@/lib/buddy/unlock";
import type { BuddyContext, ChatMessage } from "@/types/ai";

export type BuddyStreamOpts = {
  unlocked?: boolean;
};

function dropUnlockCodes(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !isPersonaUnlockCode(m.content));
}

/**
 * Single door into Buddy chat. Persona lock runs locally first, then again
 * on the Cloudflare Worker (DeepSeek — same key as Scan).
 */
export async function replyAsBuddy(
  messages: ChatMessage[],
  context?: BuddyContext,
  opts?: BuddyStreamOpts,
): Promise<string> {
  const clean = dropUnlockCodes(sanitizeMessages(messages));
  const last = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!opts?.unlocked) {
    const blocked = blockUser(last);
    if (blocked) return blocked;
  }

  if (getWorkerUrl()) {
    try {
      const raw = await providers.ai.chat(clean, context);
      return opts?.unlocked ? raw : guardReply(raw, last);
    } catch {
      return looksPolish(last)
        ? "DeepSeek milczy. Spróbuj jeszcze raz za chwilę."
        : "DeepSeek went quiet. Try me again in a second.";
    }
  }

  return mockBuddyReply(last, context);
}

async function* sseContentChunks(
  res: Response,
  box: { replace?: string },
): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json: { c?: string; r?: string };
      try {
        json = JSON.parse(payload) as { c?: string; r?: string };
      } catch {
        continue;
      }
      if (typeof json.r === "string") box.replace = json.r;
      else if (json.c) yield json.c;
    }
  }
}

/**
 * Stream / typewriter a Buddy reply. `onDelta` is called with the text so far.
 * Works with the streaming Worker and with a JSON `{ reply }` fallback.
 */
export async function streamAsBuddy(
  messages: ChatMessage[],
  context: BuddyContext | undefined,
  onDelta: (shown: string) => void,
  opts?: BuddyStreamOpts,
): Promise<string> {
  const unlocked = Boolean(opts?.unlocked);
  const clean = dropUnlockCodes(sanitizeMessages(messages));
  const last = [...clean].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!unlocked) {
    const blocked = blockUser(last);
    if (blocked) {
      await typeOut(blocked, onDelta);
      return blocked;
    }
  }

  const worker = getWorkerUrl();
  if (!worker) {
    const mock = mockBuddyReply(last, context);
    await typeOut(mock, onDelta);
    return mock;
  }

  try {
    const res = await fetch(`${worker.replace(/\/$/, "")}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify({
        messages: clean,
        context,
        ...(unlocked ? { unlock: PERSONA_UNLOCK_CODE } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Worker AI /chat: HTTP ${res.status}`);

    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const out = (await res.json()) as { reply?: string };
      const reply = unlocked ? (out.reply ?? "") : guardReply(out.reply ?? "", last);
      await typeOut(reply, onDelta);
      return reply;
    }

    const box: { replace?: string } = {};
    const typed = await typeFromChunks(sseContentChunks(res, box), onDelta);
    if (box.replace) {
      onDelta(box.replace);
      return box.replace;
    }
    return unlocked ? typed : guardReply(typed, last);
  } catch {
    const fail = looksPolish(last)
      ? "DeepSeek milczy. Spróbuj jeszcze raz za chwilę."
      : "DeepSeek went quiet. Try me again in a second.";
    await typeOut(fail, onDelta);
    return fail;
  }
}
