import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aliasForTitle,
  extractSeasonHint,
  normalizeTitleKey,
  parseCompareQuery,
  resolveTitleMatch,
  scoreTitleMatch,
  searchQueryVariants,
} from "./catalog-search.ts";
import type { AnimeSummary } from "../types/anime.ts";

function anime(id: number, romaji: string, english?: string): AnimeSummary {
  return {
    anilistId: id,
    title: { romaji, english },
    genres: [],
    tags: [],
    isAdult: false,
    streamingLinks: [],
    externalLinks: [],
    cachedAt: 0,
  };
}

const SPY = anime(140960, "SPY×FAMILY", "Spy x Family");
const SPY_S2 = anime(142838, "SPY×FAMILY Season 2", "Spy x Family Season 2");
const JJK = anime(113415, "Jujutsu Kaisen");
const JJK_S2 = anime(145064, "Jujutsu Kaisen Season 2");
const DEMON_SLAYER = anime(101922, "Kimetsu no Yaiba", "Demon Slayer: Kimetsu no Yaiba");
const DEMON_LORD = anime(105310, "Maou-sama, Retry!", "Demon Lord, Retry!");
const NARUTO = anime(20, "Naruto");

describe("normalizeTitleKey", () => {
  it("is symmetric for x/× variants", () => {
    assert.equal(normalizeTitleKey("SPY×FAMILY"), "spy x family");
    assert.equal(normalizeTitleKey("spy x family"), "spy x family");
    assert.equal(normalizeTitleKey("spyxfamily"), "spy x family");
  });
});

describe("aliasForTitle", () => {
  it("maps dirty spy family variants to the canonical title", () => {
    assert.equal(aliasForTitle("spy family"), "SPY×FAMILY");
    assert.equal(aliasForTitle("spyxfamily"), "SPY×FAMILY");
    assert.equal(aliasForTitle("spy x family"), "SPY×FAMILY");
    assert.equal(aliasForTitle("spy x fam"), "SPY×FAMILY");
  });

  it("maps community shorthands", () => {
    assert.equal(aliasForTitle("jjk"), "Jujutsu Kaisen");
    assert.equal(aliasForTitle("aot"), "Attack on Titan");
    assert.equal(aliasForTitle("demon slayer"), "Demon Slayer: Kimetsu no Yaiba");
  });

  it("returns null for unknown titles", () => {
    assert.equal(aliasForTitle("frieren beyond journeys end"), null);
  });
});

describe("searchQueryVariants", () => {
  it("puts the alias first so AniList gets the canonical title", () => {
    const variants = searchQueryVariants("spy family");
    assert.equal(variants[0], "SPY×FAMILY");
  });
});

describe("extractSeasonHint", () => {
  it("strips season markers", () => {
    assert.deepEqual(extractSeasonHint("spy family s1"), { title: "spy family", season: 1 });
    assert.deepEqual(extractSeasonHint("spy family season 1"), { title: "spy family", season: 1 });
    assert.deepEqual(extractSeasonHint("sezon 2 Naruto"), { title: "Naruto", season: 2 });
    assert.deepEqual(extractSeasonHint("Jujutsu Kaisen 2nd season"), {
      title: "Jujutsu Kaisen",
      season: 2,
    });
  });

  it("leaves plain titles alone", () => {
    assert.deepEqual(extractSeasonHint("86"), { title: "86" });
    assert.deepEqual(extractSeasonHint("Naruto"), { title: "Naruto" });
  });
});

describe("scoreTitleMatch", () => {
  it("scores dirty spy family variants as strong matches", () => {
    assert.ok(scoreTitleMatch("spy family", SPY) >= 80);
    assert.ok(scoreTitleMatch("spyxfamily", SPY) >= 80);
    assert.ok(scoreTitleMatch("spy x family", SPY) >= 80);
  });

  it("tolerates one-typo queries", () => {
    assert.ok(scoreTitleMatch("spy famili", SPY) >= 65);
  });

  it("prefers the requested season entry", () => {
    const base = scoreTitleMatch("jujutsu kaisen", JJK, 2);
    const s2 = scoreTitleMatch("jujutsu kaisen", JJK_S2, 2);
    assert.ok(s2 > base, `expected season 2 (${s2}) to beat base (${base})`);
  });

  it("does not match unrelated titles", () => {
    assert.ok(scoreTitleMatch("spy family", NARUTO) < 40);
  });
});

describe("resolveTitleMatch", () => {
  it("auto-matches a single confident hit", () => {
    const r = resolveTitleMatch("spy family", [SPY, NARUTO]);
    assert.equal(r.kind, "match");
    if (r.kind === "match") assert.equal(r.anime.anilistId, SPY.anilistId);
  });

  it("auto-matches a fuzzy single candidate (no 'clearer title' dead end)", () => {
    const r = resolveTitleMatch("spy famili", [SPY]);
    assert.equal(r.kind, "match");
    if (r.kind === "match") assert.equal(r.anime.anilistId, SPY.anilistId);
  });

  it("returns max 3 candidates when several titles are plausible", () => {
    const r = resolveTitleMatch("demon", [DEMON_SLAYER, DEMON_LORD, NARUTO]);
    assert.equal(r.kind, "candidates");
    if (r.kind === "candidates") {
      assert.ok(r.items.length <= 3);
      assert.ok(r.items.some((a) => a.anilistId === DEMON_SLAYER.anilistId));
    }
  });

  it("resolves the season hint to the right entry", () => {
    const r = resolveTitleMatch("jujutsu kaisen", [JJK, JJK_S2], 2);
    assert.equal(r.kind, "match");
    if (r.kind === "match") assert.equal(r.anime.anilistId, JJK_S2.anilistId);
  });

  it("reports none for total garbage", () => {
    const r = resolveTitleMatch("zzqqxxyy", [NARUTO, SPY]);
    assert.equal(r.kind, "none");
  });
});

describe("parseCompareQuery", () => {
  it("parses 'compare X and Y'", () => {
    assert.deepEqual(parseCompareQuery("compare Naruto and Bleach"), { a: "Naruto", b: "Bleach" });
  });

  it("parses Polish prefix with z / i", () => {
    assert.deepEqual(parseCompareQuery("porównaj Naruto z Bleach"), { a: "Naruto", b: "Bleach" });
    assert.deepEqual(parseCompareQuery("porownaj Naruto i Bleach"), { a: "Naruto", b: "Bleach" });
  });

  it("parses bare 'X vs Y'", () => {
    assert.deepEqual(parseCompareQuery("Naruto vs Bleach"), { a: "Naruto", b: "Bleach" });
    assert.deepEqual(parseCompareQuery("Spy x Family versus One Piece"), { a: "Spy x Family", b: "One Piece" });
  });

  it("prefers the hard vs split inside a prefixed compare", () => {
    assert.deepEqual(parseCompareQuery("compare Attack on Titan vs Naruto"), { a: "Attack on Titan", b: "Naruto" });
  });

  it("strips trailing punctuation", () => {
    assert.deepEqual(parseCompareQuery("compare Naruto and Bleach!"), { a: "Naruto", b: "Bleach" });
  });

  it("rejects single titles, identical sides, and non-compare lines", () => {
    assert.equal(parseCompareQuery("compare Naruto"), null);
    assert.equal(parseCompareQuery("compare Naruto and Naruto"), null);
    assert.equal(parseCompareQuery("Naruto"), null);
    assert.equal(parseCompareQuery("co oglądam"), null);
  });
});
