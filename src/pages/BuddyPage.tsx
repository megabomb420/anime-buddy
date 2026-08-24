import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memoryService } from "@/lib/services/MemoryService";
import { replyAsBuddy } from "@/lib/services/BuddyChatService";
import { getWorkerUrl } from "@/lib/worker-gateway";
import type { Conversation } from "@/types/entities";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

export default function BuddyPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const live = Boolean(getWorkerUrl());

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

      const reply = await replyAsBuddy(next.map((m) => ({ role: m.role, content: m.content })));
      await memoryService.appendMessage(convo.id, "assistant", reply);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn't respond just now." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col space-y-4">
      <header className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          R
        </span>
        <div>
          <h1 className="text-2xl font-semibold leading-none">Ren</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {live ? "DeepSeek · live" : "Local until the Worker is connected"}
          </p>
        </div>
      </header>

      {!live && (
        <p className="text-sm text-muted-foreground">
          Live voice is DeepSeek — same Worker as Scan.{" "}
          <Link to="/profile#vision" className="underline underline-offset-2">
            Connect
          </Link>
        </p>
      )}

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            I'm Ren. Night couch, anime only. Math and side quests bounce — ask me what to watch.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto border border-border bg-card"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <p className="text-xs text-muted-foreground">Buddy's on it…</p>}
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
