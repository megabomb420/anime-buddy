import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memoryService } from "@/lib/services/MemoryService";
import { providers } from "@/lib/providers";
import type { Conversation } from "@/types/entities";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Buddy — conversation with your anime friend. This pass wires the
 * AIProvider contract (mock by default) and persists conversations locally.
 */
export default function BuddyPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    try {
      let convo = conversation;
      if (!convo) {
        convo = await memoryService.startConversation();
        setConversation(convo);
      }
      await memoryService.appendMessage(convo.id, "user", text);
      const next: UiMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);

      const reply = await providers.ai.chat(next.map((m) => ({ role: m.role, content: m.content })));
      await memoryService.appendMessage(convo.id, "assistant", reply);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry — I couldn't respond right now." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Buddy</h1>
        <p className="text-xs text-muted-foreground">
          AI provider: {providers.ai.name}
          {providers.ai.name === "mock" ? " (connect the Worker for real answers)" : ""}
        </p>
      </div>

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Tell me what you loved, what you dropped, or what mood you're in — I'll learn your
            taste and find your next watch on Crunchyroll.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto bg-card border border-border"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <p className="text-xs text-muted-foreground">Buddy is thinking…</p>}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to Buddy…"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
