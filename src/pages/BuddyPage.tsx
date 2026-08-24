import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecPickCard, recPickFromAnime, type RecPick } from "@/components/anime/RecPickCard";
import { BUDDY_CHIPS, interpretBuddyQuery, wantsRecommendation } from "@/lib/buddy-intent";
import { animeTitle } from "@/lib/media";
import { persistence } from "@/lib/db/persistence";
import { memoryService } from "@/lib/services/MemoryService";
import { replyAsBuddy } from "@/lib/services/BuddyChatService";
import { recommendationService } from "@/lib/services/RecommendationService";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { getWorkerUrl } from "@/lib/worker-gateway";
import type { Conversation } from "@/types/entities";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  picks?: RecPick[];
}

async function catalogPicksFor(text: string): Promise<RecPick[]> {
  if (!wantsRecommendation(text)) return [];
  const prompt = interpretBuddyQuery(text);
  const rec = await recommendationService.recommend({
    query: prompt.query,
    context: prompt.context,
    requireCrunchyroll: false,
    localOnly: !getWorkerUrl(),
    candidateLimit: 24,
  });
  const picks: RecPick[] = [];
  for (const item of rec.items) {
    const anime = await animeCatalogService.getAnime(item.anilistId);
    if (anime) picks.push(recPickFromAnime(anime, item.reason));
  }
  return picks;
}

export default function BuddyPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const live = Boolean(getWorkerUrl());

  async function send(textRaw?: string) {
    const text = (textRaw ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    if (!textRaw) setInput("");

    try {
      let convo = conversation;
      if (!convo) {
        convo = await memoryService.startConversation();
        setConversation(convo);
      }
      await memoryService.appendMessage(convo.id, "user", text);
      const next: UiMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);

      const [picks, taste] = await Promise.all([
        catalogPicksFor(text),
        persistence.getTasteProfile().catch(() => undefined),
      ]);

      const reply = await replyAsBuddy(
        next.map((m) => ({ role: m.role, content: m.content })),
        {
          catalogPicks: picks.map((p) => ({
            title: animeTitle(p),
            genres: p.genres,
            anilistId: p.anilistId,
            coverImage: p.coverImage,
          })),
          tasteSummary: taste?.summary,
        },
      );
      await memoryService.appendMessage(convo.id, "assistant", reply);
      setMessages([...next, { role: "assistant", content: reply, picks }]);
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
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              I'm Ren. Night couch, anime only. Ask what to watch — I'll drop a cover you can tap.
            </p>
            <div className="flex flex-wrap gap-2">
              {BUDDY_CHIPS.map((chip) => (
                <Button
                  key={chip.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={sending}
                  onClick={() => void send(chip.label)}
                >
                  {chip.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto border border-border bg-card"
              }`}
            >
              {m.content}
            </div>
            {m.picks && m.picks.length > 0 && (
              <div className="max-w-[85%] space-y-2">
                {m.picks.map((pick) => (
                  <RecPickCard key={pick.anilistId} pick={pick} />
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-xs text-muted-foreground">Buddy's on it…</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex gap-2"
      >
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
