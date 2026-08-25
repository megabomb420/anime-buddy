import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowUp,
  Clock,
  Flame,
  History,
  Moon,
  Shield,
  Smile,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RecPickCard, recPickFromAnime, type RecPick } from "@/components/anime/RecPickCard";
import { CompareCard } from "@/components/anime/CompareCard";
import { LibraryConfirmCard } from "@/components/anime/LibraryConfirmCard";
import { BUDDY_CHIPS, interpretBuddyQuery, wantsRecommendation } from "@/lib/buddy-intent";
import {
  actionDoneReply,
  actionPromptReply,
  libraryBatchPromptReply,
  libraryDoneReply,
  libraryPromptReply,
  libraryReadReply,
  libraryStatusLabel,
  parseBuddyWriteIntent,
  parseLibraryReadIntent,
  rateDoneReply,
  ratePromptReply,
} from "@/lib/buddy-library";
import { parseBareTitleQuery, parseCompareQuery, parseLookupQuery, resolveTitleMatch } from "@/lib/catalog-search";
import { factsFromPicks, resolveBuddyCatalog } from "@/lib/buddy-catalog";
import { buildSessionHistory } from "@/lib/buddy-session";
import { picksMentionedInReply } from "@/lib/buddy-card-selection";
import { checkConfirmSpam, checkMessageSpam, spamReply } from "@/lib/buddy-spam";
import { undoToast } from "@/lib/undo";
import { animeTitle } from "@/lib/media";
import { looksPolish } from "@/lib/buddy/persona";
import { typeOut } from "@/lib/buddy-type";
import { persistence } from "@/lib/db/persistence";
import { db } from "@/lib/db/database";
import { memoryService } from "@/lib/services/MemoryService";
import { streamAsBuddy } from "@/lib/services/BuddyChatService";
import { recommendationService } from "@/lib/services/RecommendationService";
import { animeCatalogService } from "@/lib/services/AnimeCatalogService";
import { tasteService } from "@/lib/services/TasteService";
import { getWorkerUrl } from "@/lib/worker-gateway";
import { cn } from "@/lib/utils";
import type { Conversation, LibraryStatus, Message, MessagePayload } from "@/types/entities";
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
  actionConfirm?: {
    action: "favorite" | "unfavorite" | "remove" | "unrate" | "note" | "rewatch";
    picks: RecPick[];
    note?: string;
  };
  compare?: {
    a: AnimeSummary;
    b: AnimeSummary;
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

const LIBRARY_CHIPS = [{ label: "What am I watching?", query: "what am I watching" }];

const CONVERSATION_CHIPS = [
  { label: "Pick for me", query: "Surprise me" },
  { label: "My list", query: "what am I watching" },
  { label: "Find", prefix: "find " },
  { label: "Compare", prefix: "compare " },
  { label: "Log", prefix: "I'm watching " },
  { label: "Rate", prefix: "rate " },
] as const;

const ACTION_LABELS: Record<string, string> = {
  favorite: "Confirm · ★ Favorite",
  unfavorite: "Confirm · Unfavorite",
  remove: "Confirm · Remove from library",
  unrate: "Confirm · Remove rating",
  note: "Confirm · Save note",
  rewatch: "Confirm · Start rewatch",
};

/** Stored message → UI message (rich cards come back from the payload). */
function toUiMessage(m: Message): UiMessage | null {
  if (m.role !== "user" && m.role !== "assistant") return null;
  const p = m.payload;
  return {
    role: m.role,
    content: m.content,
    polish: p?.polish,
    picks: p?.picks,
    libraryConfirm: p?.libraryConfirm,
    rateConfirm: p?.rateConfirm,
    actionConfirm: p?.actionConfirm,
    compare: p?.compare,
  };
}

/** Keep only the card fields that exist; undefined when the reply is plain text. */
function payloadFrom(base: Partial<UiMessage>): MessagePayload | undefined {
  const payload: MessagePayload = {
    polish: base.polish,
    picks: base.picks,
    libraryConfirm: base.libraryConfirm,
    rateConfirm: base.rateConfirm,
    actionConfirm: base.actionConfirm,
    compare: base.compare,
  };
  return payload.picks ||
    payload.libraryConfirm ||
    payload.rateConfirm ||
    payload.actionConfirm ||
    payload.compare ||
    payload.polish
    ? payload
    : undefined;
}

async function persistAssistantReply(
  conversationId: string,
  reply: string,
  base: Partial<UiMessage>,
): Promise<void> {
  await memoryService.appendMessage(conversationId, "assistant", reply, payloadFrom(base));
}

async function catalogPicksFor(text: string): Promise<{ picks: RecPick[]; factsText: string }> {
  if (!wantsRecommendation(text)) return { picks: [], factsText: "" };
  const prompt = interpretBuddyQuery(text);
  const rec = await recommendationService.recommend({
    query: prompt.query,
    context: prompt.context,
    requireCrunchyroll: false,
    localOnly: !getWorkerUrl(),
    candidateLimit: 24,
    timeBudgetMinutes: prompt.timeBudgetMinutes,
  });
  const animes: AnimeSummary[] = [];
  const picks: RecPick[] = [];
  for (const item of rec.items) {
    const anime = await animeCatalogService.getAnime(item.anilistId);
    if (anime) {
      animes.push(anime);
      // Ren's reply is the recommendation reason. Keeping the reranker's
      // separate prose on the card allowed it to contradict AniList metadata.
      picks.push(recPickFromAnime(anime));
    }
  }
  return { picks, factsText: factsFromPicks(animes).factsText };
}

async function libraryCandidates(query: string, limit = 6): Promise<RecPick[]> {
  const results = await animeCatalogService.search(query, limit);
  return results.map((a) => recPickFromAnime(a));
}

/**
 * Resolve one title to a confident match, up to 3 candidates, or a single
 * best-guess card. A fuzzy "none" never dead-ends on "clearer title" when
 * there is a plausible catalog entry to offer.
 */
async function libraryCandidatesForTitle(title: string, limit = 6): Promise<RecPick[]> {
  const results = await animeCatalogService.search(title, limit);
  const resolution = resolveTitleMatch(title, results);
  if (resolution.kind === "match") return [recPickFromAnime(resolution.anime)];
  if (resolution.kind === "candidates") return resolution.items.map((a) => recPickFromAnime(a));
  return resolution.bestGuess ? [recPickFromAnime(resolution.bestGuess)] : [];
}

async function libraryCandidatesForTitles(titles: string[]): Promise<RecPick[]> {
  const per = titles.length > 1 ? 2 : 6;
  const groups = await Promise.all(
    titles.slice(0, 6).map((t) =>
      titles.length > 1 ? libraryCandidates(t, per) : libraryCandidatesForTitle(t, per),
    ),
  );
  return mergePicks(groups.flat(), [], titles.length > 1 ? 12 : 3);
}

/** Compare: resolve one side to a single confident catalog title (or null). */
async function compareSide(title: string): Promise<AnimeSummary | null> {
  const results = await animeCatalogService.search(title, 6);
  const resolution = resolveTitleMatch(title, results);
  if (resolution.kind === "match") return resolution.anime;
  if (resolution.kind === "candidates") return resolution.items[0] ?? null;
  return resolution.bestGuess ?? null;
}

function mergePicks(primary: RecPick[], extra: RecPick[], limit = 4): RecPick[] {
  const out: RecPick[] = [];
  const seen = new Set<number>();
  for (const p of [...primary, ...extra]) {
    if (!p?.anilistId || seen.has(p.anilistId)) continue;
    seen.add(p.anilistId);
    out.push(p);
  }
  return out.slice(0, limit);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const live = Boolean(getWorkerUrl());
  const location = useLocation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  messagesRef.current = messages;

  // "Ask Ren" from Featured pre-fills the composer once, then clears state.
  useEffect(() => {
    const prefill = (location.state as { prefill?: string } | null)?.prefill;
    if (!prefill) return;
    setInput(prefill);
    window.history.replaceState({}, "");
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    void (async () => {
      const latest = await memoryService.latestConversation();
      if (!latest) return;
      const history = await memoryService.getHistory(latest.id);
      if (history.length === 0) return;
      setConversation(latest);
      setMessages(
        history
          .map(toUiMessage)
          .filter((m): m is UiMessage => m !== null),
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

  async function openHistory() {
    setConversations(await persistence.listConversations());
    setHistoryOpen(true);
  }

  async function openConversation(c: Conversation) {
    if (sending) return;
    const history = await memoryService.getHistory(c.id);
    setConversation(c);
    setMessages(history.map(toUiMessage).filter((m): m is UiMessage => m !== null));
    setHistoryOpen(false);
  }

  async function deleteConversationById(id: string) {
    await persistence.deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (conversation?.id === id) {
      setConversation(null);
      setMessages([]);
    }
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

    const prevEntry = await persistence.getLibraryEntry(pick.anilistId);
    const prevProgress = await persistence.getProgress(pick.anilistId);
    await persistence.setLibraryStatus(pick.anilistId, status, progress ?? 0);
    undoToast(`Saved “${animeTitle(pick)}” · ${libraryStatusLabel(status, false)}`, async () => {
      if (prevEntry) await persistence.restoreLibraryEntry(prevEntry);
      else await persistence.removeLibraryEntry(pick.anilistId);
      await persistence.restoreProgress(pick.anilistId, prevProgress);
    });
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

    const prevRating = await persistence.getAnimeRating(pick.anilistId);
    await persistence.setAnimeRating(pick.anilistId, score);
    undoToast(`Rated “${animeTitle(pick)}” ${score}/10`, async () => {
      if (prevRating) await persistence.restoreAnimeRating(prevRating);
      else await persistence.removeAnimeRating(pick.anilistId);
    });
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

  async function confirmAction(
    action: "favorite" | "unfavorite" | "remove" | "unrate" | "note" | "rewatch",
    pick: RecPick,
    polish: boolean,
    note?: string,
  ) {
    const spam = checkConfirmSpam();
    if (spam.ok === false && spam.reason) {
      const reply = spamReply(spam.reason, polish);
      const convo = await ensureConvo();
      await memoryService.appendMessage(convo.id, "assistant", reply);
      await revealAssistant({ role: "assistant", content: "", polish }, reply);
      return;
    }

    const id = pick.anilistId;
    const title = animeTitle(pick);

    if (action === "favorite" || action === "unfavorite") {
      const wasFav = await persistence.isFavoriteAnime(id);
      if (action === "favorite") await persistence.addFavoriteAnime(id);
      else await persistence.removeFavoriteAnime(id);
      undoToast(
        action === "favorite"
          ? `Added “${title}” to favorites`
          : `Removed “${title}” from favorites`,
        async () => {
          if (wasFav) await persistence.addFavoriteAnime(id);
          else await persistence.removeFavoriteAnime(id);
        },
      );
    } else if (action === "remove") {
      const prevEntry = await persistence.getLibraryEntry(id);
      const prevProgress = await persistence.getProgress(id);
      await persistence.removeLibraryEntry(id);
      undoToast(`Removed “${title}” from Library`, async () => {
        if (prevEntry) await persistence.restoreLibraryEntry(prevEntry);
        await persistence.restoreProgress(id, prevProgress);
      });
    } else if (action === "unrate") {
      const prevRating = await persistence.getAnimeRating(id);
      await persistence.removeAnimeRating(id);
      undoToast(`Removed rating for “${title}”`, async () => {
        if (prevRating) await persistence.restoreAnimeRating(prevRating);
      });
    } else if (action === "note" && note) {
      const saved = await persistence.addNote({ subjectType: "anime", subjectId: id, body: note });
      undoToast(`Note saved on “${title}”`, async () => {
        await db.userNotes.delete(saved.id);
      });
      try {
        await tasteService.learnFromNote(saved.id);
      } catch {
        /* optional */
      }
    } else if (action === "rewatch") {
      const prevEntry = await persistence.getLibraryEntry(id);
      const prevProgress = await persistence.getProgress(id);
      await persistence.rewatchAnime(id);
      undoToast(`Rewatch started for “${title}” · ep 0`, async () => {
        if (prevEntry) await persistence.restoreLibraryEntry(prevEntry);
        else await persistence.removeLibraryEntry(id);
        await persistence.restoreProgress(id, prevProgress);
      });
    } else {
      return;
    }

    const convo = await ensureConvo();
    const reply = actionDoneReply(action, title, polish);
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
        compare: base.compare,
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
      if (!convo.title) {
        const title = text.length > 48 ? `${text.slice(0, 47)}…` : text;
        void persistence.renameConversation(convo.id, title);
        setConversation({ ...convo, title });
      }
      const next: UiMessage[] = [...messagesRef.current, { role: "user", content: text, polish }];
      setMessages(next);

      const write = parseBuddyWriteIntent(text);
      if (write?.kind === "library") {
        const titles = write.titles.length ? write.titles : [write.query];
        const candidates = await libraryCandidatesForTitles(titles);
        const reply =
          titles.length > 1
            ? libraryBatchPromptReply(write.status, candidates.length, titles.length, polish)
            : libraryPromptReply(write.status, candidates.length, polish, write.progress);
        const libraryConfirm =
          candidates.length > 0
            ? {
                status: write.status,
                picks: candidates,
                progress: write.progress,
                reason: write.reason,
              }
            : undefined;
        await persistAssistantReply(convo.id, reply, { polish, libraryConfirm });
        await revealAssistant(
          {
            role: "assistant",
            polish,
            libraryConfirm,
          },
          reply,
        );
        return;
      }

      if (write?.kind === "rate") {
        const titles = write.titles.length ? write.titles : [write.query];
        const candidates = await libraryCandidatesForTitles(titles);
        const reply = ratePromptReply(write.score, candidates.length, polish);
        const rateConfirm =
          candidates.length > 0 ? { score: write.score, picks: candidates } : undefined;
        await persistAssistantReply(convo.id, reply, { polish, rateConfirm });
        await revealAssistant(
          {
            role: "assistant",
            polish,
            rateConfirm,
          },
          reply,
        );
        return;
      }

      if (
        write?.kind === "favorite" ||
        write?.kind === "remove" ||
        write?.kind === "unrate" ||
        write?.kind === "note" ||
        write?.kind === "rewatch"
      ) {
        const titles = write.titles.length ? write.titles : [write.query];
        const candidates = await libraryCandidatesForTitles(titles);
        const action: "favorite" | "unfavorite" | "remove" | "unrate" | "note" | "rewatch" =
          write.kind === "favorite" && write.unfavorite ? "unfavorite" : write.kind;
        const reply = actionPromptReply(action, candidates.length, polish);
        const actionConfirm =
          candidates.length > 0
            ? {
                action,
                picks: candidates,
                note: write.kind === "note" ? write.note : undefined,
              }
            : undefined;
        await persistAssistantReply(convo.id, reply, { polish, actionConfirm });
        await revealAssistant(
          {
            role: "assistant",
            polish,
            actionConfirm,
          },
          reply,
        );
        return;
      }

      const libraryRead = parseLibraryReadIntent(text);
      if (libraryRead) {
        const entries = await persistence.getLibrary(libraryRead.status);
        const picks: RecPick[] = [];
        for (const e of entries.slice(0, 20)) {
          const anime =
            (await persistence.getCachedAnime(e.anilistId)) ??
            (await animeCatalogService.getAnime(e.anilistId));
          if (anime) {
            picks.push(recPickFromAnime(anime, libraryStatusLabel(e.status, polish)));
          }
        }
        const reply = libraryReadReply(libraryRead.status, picks.length, polish);
        await persistAssistantReply(convo.id, reply, { polish, picks: picks.length ? picks : undefined });
        await revealAssistant(
          {
            role: "assistant",
            polish,
            picks: picks.length ? picks : undefined,
          },
          reply,
        );
        return;
      }

      const compare = parseCompareQuery(text);
      if (compare) {
        const [a, b] = await Promise.all([compareSide(compare.a), compareSide(compare.b)]);
        let reply: string;
        if (a && b) {
          reply = polish ? "Obok siebie, prosto z AniList:" : "Side by side, straight from AniList:";
        } else {
          const missing = !a ? compare.a : compare.b;
          reply = polish
            ? `Nie znalazłem „${missing}” w katalogu AniList. Spróbuj dokładniejszego tytułu.`
            : `Couldn't pin down “${missing}” in the AniList catalog. Try a clearer title.`;
        }
        const found = a ?? b;
        const comparePayload = a && b ? { a, b } : undefined;
        const comparePicks = !(a && b) && found ? [recPickFromAnime(found)] : undefined;
        await persistAssistantReply(convo.id, reply, {
          polish,
          compare: comparePayload,
          picks: comparePicks,
        });
        await revealAssistant(
          {
            role: "assistant",
            polish,
            compare: comparePayload,
            picks: comparePicks,
          },
          reply,
        );
        return;
      }

      const lookup = parseLookupQuery(text) ?? parseBareTitleQuery(text);
      if (lookup) {
        const candidates = await libraryCandidates(lookup);
        const reply = lookupReply(lookup, candidates.length, polish);
        await persistAssistantReply(convo.id, reply, {
          polish,
          picks: candidates.length > 0 ? candidates : undefined,
        });
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
      const settingsPromise = persistence.getSettings().catch(() => undefined);
      const spoilerPromise = persistence.getSpoilerLimits().catch(() => []);
      const [rec, catalog, taste, settings, spoilerLimits] = await Promise.all([
        recPromise,
        catalogPromise,
        tastePromise,
        settingsPromise,
        spoilerPromise,
      ]);

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
        buildSessionHistory(next.map((m) => ({ role: m.role, content: m.content }))),
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
          spoilerLevel: settings?.spoilerLevel ?? "normal",
          spoilerLimits: spoilerLimits.length ? spoilerLimits : undefined,
          recommendationTurn: recAsk,
        },
        onDelta,
        (extra) => {
          workerPicks = extra;
        },
      );

      // Candidates are context, not output. A card becomes visible only after
      // Ren explicitly names that AniList title in the final reply.
      const shownPicks = picksMentionedInReply(
        reply,
        mergePicks(workerPicks, picks),
      );

      await persistAssistantReply(convo.id, reply, {
        polish,
        picks: shownPicks.length ? shownPicks : undefined,
      });
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
          aria-label="Chat history"
          disabled={sending}
          onClick={() => void openHistory()}
        >
          <History className="size-4" />
        </Button>
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

      {messages.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border/70 px-4 py-2 scrollbar-none">
          {CONVERSATION_CHIPS.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-full px-3 text-xs"
              disabled={sending}
              onClick={() =>
                "query" in chip && chip.query
                  ? void send(chip.query)
                  : applyPrefix("prefix" in chip ? chip.prefix : "")
              }
            >
              {chip.label}
            </Button>
          ))}
        </div>
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
                {LIBRARY_CHIPS.map((item) => (
                  <Button
                    key={item.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full"
                    disabled={sending}
                    onClick={() => void send(item.query)}
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
                {m.actionConfirm && m.actionConfirm.picks.length > 0 && (
                  <div className="max-w-[85%] space-y-2">
                    {m.actionConfirm.picks.map((pick) => (
                      <LibraryConfirmCard
                        key={`${m.actionConfirm!.action}-${pick.anilistId}`}
                        pick={pick}
                        polish={Boolean(m.polish)}
                        action={ACTION_LABELS[m.actionConfirm!.action] ?? "Confirm"}
                        onConfirm={(p) =>
                          confirmAction(
                            m.actionConfirm!.action,
                            p,
                            Boolean(m.polish),
                            m.actionConfirm!.note,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
                {m.picks && m.picks.length > 0 && (
                  <div className="max-w-[85%] space-y-2">
                    {m.role === "assistant" && (
                      <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        AniList · mentioned by Ren
                      </p>
                    )}
                    {m.picks.map((pick) => (
                      <RecPickCard key={pick.anilistId} pick={pick} />
                    ))}
                  </div>
                )}
                {m.compare && (
                  <div className="max-w-[85%]">
                    <CompareCard a={m.compare.a} b={m.compare.b} />
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

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-[85%] max-w-sm flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Chats</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {conversations.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">No past chats yet.</p>
            ) : (
              <ul className="space-y-1 pt-2">
                {conversations.map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void openConversation(c)}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left hover:bg-accent",
                        c.id === conversation?.id && "bg-accent",
                      )}
                    >
                      <p className="truncate text-sm font-medium">{c.title || "Chat"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(c.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}
                        {new Date(c.updatedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground"
                      aria-label="Delete chat"
                      onClick={() => void deleteConversationById(c.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
