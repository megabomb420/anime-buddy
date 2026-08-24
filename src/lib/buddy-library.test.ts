import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseLibraryIntent,
  parseLibraryReadIntent,
  parseRateIntent,
  splitTitleList,
} from "./buddy-library.ts";

describe("parseLibraryIntent", () => {
  it("parses Polish completed watch", () => {
    const intent = parseLibraryIntent("oglądałem Attack on Titan");
    assert.ok(intent);
    assert.equal(intent?.status, "completed");
    assert.match(intent?.query ?? "", /Attack on Titan/i);
    assert.deepEqual(intent?.titles, ["Attack on Titan"]);
  });

  it("parses English watching", () => {
    const intent = parseLibraryIntent("I'm watching Naruto");
    assert.ok(intent);
    assert.equal(intent?.status, "watching");
    assert.match(intent?.query ?? "", /Naruto/i);
  });

  it("parses plan to watch", () => {
    const intent = parseLibraryIntent("chcę obejrzeć Steins;Gate");
    assert.ok(intent);
    assert.equal(intent?.status, "plan_to_watch");
    assert.deepEqual(intent?.titles, ["Steins;Gate"]);
  });

  it("ignores rec asks", () => {
    assert.equal(parseLibraryIntent("co oglądać wieczorem"), null);
    assert.equal(parseLibraryIntent("Something funny"), null);
  });

  it("splits a comma list into confirm titles", () => {
    const intent = parseLibraryIntent("I finished Attack on Titan, Naruto, and One Piece");
    assert.ok(intent);
    assert.equal(intent?.status, "completed");
    assert.deepEqual(intent?.titles, ["Attack on Titan", "Naruto", "One Piece"]);
  });

  it("splits Polish i-lists without breaking Steins;Gate", () => {
    const intent = parseLibraryIntent("oglądam Naruto, Bleach i One Piece");
    assert.equal(intent?.status, "watching");
    assert.deepEqual(intent?.titles, ["Naruto", "Bleach", "One Piece"]);
  });

  it("parses suffix form 'add X to watched' as completed", () => {
    const intent = parseLibraryIntent("Add spy x family to watched");
    assert.ok(intent);
    assert.equal(intent?.status, "completed");
    assert.equal(intent?.query, "spy x family");
  });

  it("parses bare finished variants", () => {
    assert.equal(parseLibraryIntent("I finished spy family")?.status, "completed");
    assert.equal(parseLibraryIntent("done with attack titan")?.query, "attack titan");
    assert.equal(parseLibraryIntent("caught up with Frieren")?.status, "completed");
    assert.equal(parseLibraryIntent("binged solo leveling")?.status, "completed");
  });

  it("parses Polish completed variants", () => {
    assert.equal(parseLibraryIntent("obejrzałem spyxfamily")?.status, "completed");
    assert.equal(parseLibraryIntent("dodaj Naruto do obejrzanych")?.status, "completed");
    assert.equal(parseLibraryIntent("skończyłem oglądać Bleach")?.query, "Bleach");
  });

  it("keeps 'add X to my list' as plan_to_watch", () => {
    const intent = parseLibraryIntent("add Naruto to my list");
    assert.equal(intent?.status, "plan_to_watch");
    assert.equal(intent?.query, "Naruto");
  });
});

describe("splitTitleList", () => {
  it("keeps a single title with a semicolon", () => {
    assert.deepEqual(splitTitleList("Steins;Gate"), ["Steins;Gate"]);
  });

  it("splits and-lists", () => {
    assert.deepEqual(splitTitleList("Frieren and Dungeon Meshi"), ["Frieren", "Dungeon Meshi"]);
  });
});

describe("parseRateIntent", () => {
  it("splits scored titles", () => {
    const intent = parseRateIntent("rate 9 Naruto and Bleach");
    assert.ok(intent);
    assert.equal(intent?.score, 9);
    assert.deepEqual(intent?.titles, ["Naruto", "Bleach"]);
  });
});

describe("parseLibraryReadIntent", () => {
  it("reads watching without going to catalog search", () => {
    const intent = parseLibraryReadIntent("what am I watching");
    assert.equal(intent?.status, "watching");
    assert.equal(parseLibraryReadIntent("co oglądam")?.status, "watching");
  });

  it("reads the whole library", () => {
    assert.equal(parseLibraryReadIntent("what's in my library")?.status, undefined);
    assert.equal(parseLibraryReadIntent("co mam w bibliotece")?.status, undefined);
  });

  it("does not steal writes or recs", () => {
    assert.equal(parseLibraryReadIntent("I'm watching Naruto"), null);
    assert.equal(parseLibraryReadIntent("oglądam One Piece"), null);
    assert.equal(parseLibraryReadIntent("co oglądać wieczorem"), null);
    assert.equal(parseLibraryReadIntent("what should I watch"), null);
  });
});
