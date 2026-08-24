import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowUp,
  Clock,
  Flame,
  Moon,
  Shield,
  Smile,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecPickCard, recPickFromAnime, type RecPick } from "@/components/anime/RecPickCard";
import { LibraryConfirmCard } from "@/components/anime/LibraryConfirmCard";
import { BUDDY_CHIPS, interpretBuddyQuery, wantsRecommendation } from "@/lib/buddy-intent";
import {
  libraryDoneReply,
  libraryPromptReply,
  parseBuddyWriteIntent,
  rateDoneReply,
  ratePromptReply,
} from "@/lib/buddy-library";
import { parseBareTitleQuery, parseLookupQuery } from "@/lib/catalog-search";
import { factsFromPicks, resolveBuddyCatalog } from "@/lib/buddy-catalog";
import { checkConfirmSpam, checkMessageSpam, spamReply } from "@/lib/buddy-spam";
import { animeTitle } from "@/lib/media";
import { looksPolish } from "@/lib/buddy/persona";
import { typeOut } from "@/lib/buddy-type";
import { persistence } from "@/lib/db/persistence";
import { memoryService } from "@/lib/services/MemoryService";
import { streamAsBuddy } from "@/lib/services/BuddyChatService";
import { recommendationService } from "@/lib/services/RecommendationService";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { tasteService } from "@/lib/services/TasteService";
import { getWorkerUrl } from "@/lib/worker-gateway";
import { cn } from "@/lib/utils";
import type { Conversation, LibraryStatus } from "@/types/entities";
import type { AnimeSummary } from "@/types/anime";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  polish?: boolean;
  streaming?: boolean;
  picks?: RecPick[];
  libraryConfirm?: {
    status: LibraryStatus;
    picks: RecPick[];
    progress?: number;
    reason?: string;
  };
  rateConfirm?: {
    score: number;
    picks: RecPick[];
  };
}

const CHIP_ICONS: Record<string, LucideIcon> = {
  "Something funny": Smile,
  "Something dark": Moon,
  "Short tonight": Clock,
  "Popular unread": Flame,
  "Suitable 12+": Shield,
  "Surprise me": Sparkles,
};

const LOG_PREFIXES = [
  { label: "I finished…", prefix: "I finished " },
  { label: "I'm watching…", prefix: "I'm watching " },
  { label: "Episode…", prefix: "episode " },
  { label: "Rate…", prefix: "rate " },
];

async function catalogPicksFor(text: string): Promise<{ picks: RecPick[]; factsText: string }> {
  if (!wantsRecommendation(text)) return { picks: [], factsText: "" };
  const prompt = interpretBuddyQuery(text);
  const rec = await recommendationService.recommend({
    query: prompt.query,
    context: prompt.context,
    requireCrunchyroll: false,
    localOnly: !getWorkerUrl(),
    candidateLimit: 24,
  });
  const animes: AnimeSummary[] = [];
  const picks: RecPick[] = [];
  for (const item of rec.items) {
    const anime = await animeCatalogService.getAnime(item.anilistId);
    if (anime) {
      animes.push(anime);
      picks.push(recPickFromAnime(anime, item.reason));
    }
  }
  return { picks, factsText: factsFromPicks(animes).factsText };
}

async function libraryCandidates(query: string): Promise<RecPick[]> {
  const results = await animeCatalogService.search(query, 6);
  return results.map((a) => recPickFromAnime(a));
}

function mergePicks(primary: RecPick[], extra: RecPick[]): RecPick[] {
  const out: RecPick[] = [];
  const seen = new Set<number>();
  for (const p of [...primary, ...extra]) {
    if (!p?.anilistId || seen.has(p.anilistId)) continue;
    seen.add(p.anilistId);
    out.push(p);
  }
  return out.slice(0, 4);
}

function lookupReply(query: string, count: number, polish: boolean): string {
  if (count === 0) {
    return polish
      ? `Nie znalazłem „${query}” w katalogu AniList. Spróbuj innego zapisu tytułu.`
      : `Nothing matched “${query}” in the AniList catalog. Try another spelling.`;
  }
  if (count === 1) {
    return polish ? "To ten tytuł z katalogu:" : "This catalog match:";
  }
  return polish ? "Trafienia z katalogu:" : "Catalog matches:";
}

function TypingDots() {
  return (
    <div className="mr-auto flex max-w-[85%] items-center gap-1 rounded-2xl border border-border bg-card px-4 py-3">
      <span className="buddy-dot" />
      <span className="buddy-dot" />
      <span className="buddy-dot" />
    </div>
  );
}

export default function BuddyPage() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const live = Boolean(getWorkerUrl());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    void (async () => {
      const latest = await memoryService.latestConversation();
      if (!latest) return;
      const history = await memoryService.getHistory(latest.id);
      if (history.length === 0) return;
      setConversation(latest);
      setMessages(
        history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      );
    })();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function ensureConvo() {
    if (conversation) return conversation;
    const convo = await memoryService.startConversation();
    setConversation(convo);
    return convo;
  }

  async function startFresh() {
    if (sending) return;
    const convo = await memoryService.startConversation();
    setConversation(convo);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  function applyPrefix(prefix: string) {
    setInput(prefix);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const end = prefix.length;
      el.setSelectionRange(end, end);
    });
  }

  async function confirmLibrary(
    status: LibraryStatus,
    pick: RecPick,
    polish: boolean,
    progress?: number,
    reason?: string,
  ) {
    const spam = checkConfirmSpam();
    if (!spam.ok && spam.reason) {
      const reply = spamReply(spam.reason, polish);
      const convo = await ensureConvo();
      await memoryService.appendMessage(convo.id, "assistant", reply);
      await revealAssistant({ role: "assistant", content: "", polish }, reply);
      return;
    }

    await persistence.setLibraryStatus(pick.anilistId, status, progress ?? 0);
    if (reason && status === "dropped") {
      try {
        await persistence.addTasteSignal({
          kind: "free-text",
          value: reason.slice(0, 120).toLowerCase(),
          weight: -0.4,
          source: "conversation",
          subjectId: pick.anilistId,
        });
      } catch {
        /* optional */
      }
    }
    const convo = await ensureConvo();
    const reply = libraryDoneReply(animeTitle(pick), status, polish, progress);
    await memoryService.appendMessage(convo.id, "assistant", reply);
    await revealAssistant({ role: "assistant", content: "", polish }, reply);
  }

  async function confirmRating(score: number, pick: RecPick, polish: boolean) {
    const spam = checkConfirmSpam();
    if (!spam.ok && spam.reason) {
      const reply = spamReply(spam.reason, polish);
      const convo = await ensureConvo();
      await memoryService.appendMessage(convo.id, "assistant", reply);
      await revealAssistant({ role: "assistant", content: "", polish }, reply);
      return;
    }

    await persistence.setAnimeRating(pick.anilistId, score);
    try {
      await tasteService.learnFromRating(pick.anilistId, score);
    } catch {
      /* optional */
    }
    const convo = await ensureConvo();
    const reply = rateDoneReply(animeTitle(pick), score, polish);
    await memoryService.appendMessage(convo.id, "assistant", reply);
    await revealAssistant({ role: "assistant", content: "", polish }, reply);
  }

  function patchLastAssistant(patch: Partial<UiMessage>) {
    setMessages((prev) => {
      const copy = [...prev];
      const i = copy.length - 1;
      if (i < 0 || copy[i].role !== "assistant") return prev;
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  async function revealAssistant(base: Omit<UiMessage, "content"> & { content?: string }, text: string) {
    let added = false;
    await typeOut(text, (shown) => {
      if (!shown) return;
      if (!added) {
        added = true;
        setMessages((prev) => [...prev, { ...base, role: "assistant", content: shown, streaming: true }]);
      } else {
        patchLastAssistant({ content: shown, streaming: true });
      }
    });
    if (!added) {
      setMessages((prev) => [...prev, { ...base, role: "assistant", content: text, streaming: false }]);
    } else {
      patchLastAssistant({
        content: text,
        streaming: false,
        picks: base.picks,
        libraryConfirm: base.libraryConfirm,
        rateConfirm: base.rateConfirm,
      });
    }
  }

  async function send(textRaw?: string) {
    const text = (textRaw ?? input).trim();
    if (!text || sending) return;

    const polish = looksPolish(text) || /[ąćęłńóśźż]/i.test(text);
    const spam = checkMessageSpam(text);
    if (!spam.ok && spam.reason) {
      if (!textRaw) setInput("");
      const reply = spamReply(spam.reason, polish);
      setMessages((prev) => [...prev, { role: "user", content: text, polish }]);
      setSending(true);
      try {
        await revealAssistant({ role: "assistant", polish }, reply);
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    if (!textRaw) setInput("");

    try {
      const convo = await ensureConvo();
      await memoryService.appendMessage(convo.id, "user", text);
      const next: UiMessage[] = [...messagesRef.current, { role: "user", content: text, polish }];
      setMessages(next);

      const write = parseBuddyWriteIntent(text);
      if (write?.kind === "library") {
        const candidates = await libraryCandidates(write.query);
        const reply = libraryPromptReply(write.status, candidates.length, polish, write.progress);
        await memoryService.appendMessage(convo.id, "assistant", reply);
        await revealAssistant(
          {
            role: "assistant",
            polish,
            libraryConfirm:
              candidates.length > 0
                ? {
                    status: write.status,
                    picks: candidates,
                    progress: write.progress,
                    reason: write.reason,
                  }
                : undefined,
          },
          reply,
        );
        return;
      }

      if (write?.kind === "rate") {
        const candidates = await libraryCandidates(write.query);
        const reply = ratePromptReply(write.score, candidates.length, polish);
        await memoryService.appendMessage(convo.id, "assistant", reply);
        await revealAssistant(
          {
            role: "assistant",
            polish,
            rateConfirm:
              candidates.length > 0 ? { score: write.score, picks: candidates } : undefined,
          },
          reply,
        );
        return;
      }

      const lookup = parseLookupQuery(text) ?? parseBareTitleQuery(text);
      if (lookup) {
        const candidates = await libraryCandidates(lookup);
        const reply = lookupReply(lookup, candidates.length, polish);
        await memoryService.appendMessage(convo.id, "assistant", reply);
        await revealAssistant(
          {
            role: "assistant",
            polish,
            picks: candidates.length > 0 ? candidates : undefined,
          },
          reply,
        );
        return;
      }

      const recAsk = wantsRecommendation(text);
      const recPromise = recAsk
        ? catalogPicksFor(text)
        : Promise.resolve({ picks: [] as RecPick[], factsText: "" });
      const catalogPromise = resolveBuddyCatalog(text);
      const tastePromise = persistence.getTasteProfile().catch(() => undefined);
      const [rec, catalog, taste] = await Promise.all([recPromise, catalogPromise, tastePromise]);

      const picks = rec.picks.length ? rec.picks : catalog.animes.map((a) => recPickFromAnime(a));
      const factsText = rec.factsText || catalog.factsText;
      let workerPicks: RecPick[] = [];

      let added = false;
      const onDelta = (shown: string) => {
        if (!shown) return;
        if (!added) {
          added = true;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: shown, polish, streaming: true },
          ]);
        } else {
          patchLastAssistant({ content: shown, streaming: true });
        }
      };

      const reply = await streamAsBuddy(
        next.map((m) => ({ role: m.role, content: m.content })),
        {
          catalogPicks: picks.map((p) => ({
            title: animeTitle(p),
            genres: p.genres,
            anilistId: p.anilistId,
            coverImage: p.coverImage,
          })),
          catalogFacts: factsText || undefined,
          libraryBrief: catalog.libraryBrief || undefined,
          tasteSummary: taste?.summary,
        },
        onDelta,
        (extra) => {
          workerPicks = extra;
        },
      );

      const shownPicks = mergePicks(picks, workerPicks);

      await memoryService.appendMessage(convo.id, "assistant", reply);
      if (!added) {
        setMessages((prev) => [...prev, { role: "assistant", content: reply, polish, picks: shownPicks }]);
      } else {
        patchLastAssistant({ content: reply, streaming: false, picks: shownPicks });
      }
    } catch {
      await revealAssistant({ role: "assistant" }, "I couldn't respond just now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-secondary text-sm font-semibold">
          R
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-none tracking-tight">Ren</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                live ? "bg-foreground" : "bg-muted-foreground/50",
              )}
            />
            {live ? "DeepSeek · live" : "Local until the Worker is connected"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          aria-label="New chat"
          disabled={sending}
          onClick={() => void startFresh()}
        >
          <SquarePen className="size-4" />
        </Button>
      </header>

      {!live && (
        <p className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
          Live voice is DeepSeek — same Worker as Scan.{" "}
          <Link to="/profile#vision" className="underline underline-offset-2">
            Connect
          </Link>
        </p>
      )}

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {messages.length === 0 ? (
          <div className="buddy-empty flex min-h-full flex-col justify-center py-6">
            <div className="flex flex-col items-start gap-3">
              <span className="inline-flex size-14 items-center justify-center rounded-full border border-border bg-secondary text-lg font-semibold">
                R
              </span>
              <div className="space-y-1.5">
                <p className="text-xl font-semibold tracking-tight">Night couch. Anime only.</p>
                <p className="max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                  Ask what to watch — I'll drop a cover you can tap. Log progress, scores, or finished titles — I confirm before writing Library.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              {BUDDY_CHIPS.map((chip) => {
                const Icon = CHIP_ICONS[chip.label] ?? Sparkles;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={sending}
                    onClick={() => void send(chip.label)}
                    className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-3 text-left pressable"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-medium leading-snug">{chip.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Log a title
              </p>
              <div className="flex flex-wrap gap-2">
                {LOG_PREFIXES.map((item) => (
                  <Button
                    key={item.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full"
                    disabled={sending}
                    onClick={() => applyPrefix(item.prefix)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={m.role === "user" ? "flex justify-end" : "space-y-2"}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto border border-border bg-card",
                    m.streaming && "buddy-caret",
                  )}
                >
                  {m.content}
                </div>
                {m.libraryConfirm && m.libraryConfirm.picks.length > 0 && (
                  <div className="max-w-[85%] space-y-2">
                    {m.libraryConfirm.picks.map((pick) => (
                      <LibraryConfirmCard
                        key={pick.anilistId}
                        pick={pick}
                        status={m.libraryConfirm!.status}
                        progress={m.libraryConfirm!.progress}
                        polish={Boolean(m.polish)}
                        onConfirm={(p) =>
                          confirmLibrary(
                            m.libraryConfirm!.status,
                            p,
                            Boolean(m.polish),
                            m.libraryConfirm!.progress,
                            m.libraryConfirm!.reason,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
                {m.rateConfirm && m.rateConfirm.picks.length > 0 && (
                  <div className="max-w-[85%] space-y-2">
                    {m.rateConfirm.picks.map((pick) => (
                      <LibraryConfirmCard
                        key={`rate-${pick.anilistId}`}
                        pick={pick}
                        score={m.rateConfirm!.score}
                        polish={Boolean(m.polish)}
                        onConfirm={(p) => confirmRating(m.rateConfirm!.score, p, Boolean(m.polish))}
                      />
                    ))}
                  </div>
                )}
                {m.picks && m.picks.length > 0 && (
                  <div className="max-w-[85%] space-y-2">
                    {m.picks.map((pick) => (
                      <RecPickCard key={pick.anilistId} pick={pick} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && messages[messages.length - 1]?.streaming !== true && <TypingDots />}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="shrink-0 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur"
      >
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. spy x family · find Naruto"
            disabled={sending}
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 rounded-full bg-secondary/70 px-4"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
