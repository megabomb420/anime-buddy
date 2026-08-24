import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionHistory,
  SESSION_KEEP_RECENT,
  SESSION_MAX_MESSAGES,
  summarizeSessionTurns,
} from "./buddy-session.ts";
import type { ChatMessage } from "../types/ai.ts";

function chat(...texts: string[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  texts.forEach((t, i) => out.push({ role: i % 2 === 0 ? "user" : "assistant", content: t }));
  return out;
}

describe("summarizeSessionTurns", () => {
  it("captures logged, rated, looked-up, and rec-ask turns", () => {
    const recap = summarizeSessionTurns(
      chat(
        "I finished Naruto",
        "ok",
        "rate 9 Attack on Titan",
        "noted",
        "znajdź Spy x Family",
        "here",
        "something funny",
        "sure",
      ),
    );
    assert.match(recap, /Logged: Naruto → completed/);
    assert.match(recap, /Rated: Attack on Titan → 9\/10/);
    assert.match(recap, /Looked up: Spy x Family/i);
    assert.match(recap, /Rec asks:/);
  });

  it("keeps episode progress on library logs", () => {
    const recap = summarizeSessionTurns(chat("episode 12 One Piece", "ok"));
    assert.match(recap, /One Piece → watching, ep 12/);
  });

  it("returns empty string when nothing parseable was said", () => {
    assert.equal(summarizeSessionTurns(chat("lol", "heh", "hmm", "ok")), "");
  });

  it("ignores assistant messages", () => {
    assert.equal(summarizeSessionTurns([{ role: "assistant", content: "rate 9 Naruto" }]), "");
  });
});

describe("buildSessionHistory", () => {
  it("passes short chats through untouched", () => {
    const history = chat("hi", "yo", "co oglądam", "cards");
    assert.deepEqual(buildSessionHistory(history), history);
  });

  it("replaces older turns with one recap and keeps the recent tail", () => {
    const old = chat("I finished Naruto", "ok", "rate 9 Bleach", "noted");
    const recent = Array.from({ length: SESSION_KEEP_RECENT }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `recent ${i}`,
    }));
    const out = buildSessionHistory([...old, ...recent]);

    assert.equal(out.length, SESSION_MAX_MESSAGES);
    assert.equal(out[0].role, "user");
    assert.match(out[0].content, /^\[Earlier in this chat — recap\]/);
    assert.match(out[0].content, /Naruto → completed/);
    assert.match(out[0].content, /Bleach → 9\/10/);
    assert.equal(out[out.length - 1].content, `recent ${SESSION_KEEP_RECENT - 1}`);
  });

  it("falls back to a plain tail cut when older turns have no parseable intent", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `blah ${i}`,
    }));
    const out = buildSessionHistory(history);
    assert.equal(out.length, SESSION_MAX_MESSAGES);
    assert.equal(out[0].content, "blah 18");
    assert.equal(out[out.length - 1].content, "blah 29");
  });
});
