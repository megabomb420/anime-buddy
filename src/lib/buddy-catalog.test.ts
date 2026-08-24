import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { factFromAnime, formatCatalogFacts, parseCatalogAsk } from "./buddy-catalog-ask.ts";
import type { AnimeSummary } from "../types/anime.ts";

describe("parseCatalogAsk", () => {
  it("marks rec chips and watch asks as rec, not a title search", () => {
    assert.equal(parseCatalogAsk("Something funny").kind, "rec");
    assert.equal(parseCatalogAsk("co oglądać wieczorem").kind, "rec");
    assert.equal(parseCatalogAsk("poleć coś mrocznego").kind, "rec");
  });

  it("pulls a title out of factual questions", () => {
    const a = parseCatalogAsk("ile odcinków ma One Piece");
    assert.equal(a.kind, "lookup");
    assert.equal(a.query, "One Piece");

    const b = parseCatalogAsk("tell me about Steins;Gate");
    assert.equal(b.kind, "lookup");
    assert.match(b.query ?? "", /Steins/);

    const c = parseCatalogAsk('co wiesz o "Frieren"');
    assert.equal(c.kind, "lookup");
    assert.equal(c.query, "Frieren");
  });

  it("detects character and browse asks", () => {
    const c = parseCatalogAsk("kto to Lelouch");
    assert.equal(c.kind, "character");
    assert.equal(c.query, "Lelouch");

    assert.equal(parseCatalogAsk("what's trending").browse, "trending");
    assert.equal(parseCatalogAsk("ten sezon").browse, "seasonal");
    assert.equal(parseCatalogAsk("najpopularniejsze teraz").browse, "popular");
  });

  it("treats a quoted title as a lookup, not a bare line", () => {
    const a = parseCatalogAsk('"Attack on Titan"');
    assert.equal(a.kind, "lookup");
    assert.equal(a.query, "Attack on Titan");
    assert.equal(parseCatalogAsk("Attack on Titan").kind, "none");
  });

  it("does not treat greetings or library logs as lookups", () => {
    assert.equal(parseCatalogAsk("cześć").kind, "none");
    assert.equal(parseCatalogAsk("I finished Naruto").kind, "none");
    assert.equal(parseCatalogAsk("oglądałem Attack on Titan").kind, "none");
  });
});

describe("formatCatalogFacts", () => {
  it("packs AniList fields Ren is allowed to state", () => {
    const anime: AnimeSummary = {
      anilistId: 16498,
      title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan" },
      format: "TV",
      status: "FINISHED",
      season: "SPRING",
      seasonYear: 2013,
      episodes: 25,
      genres: ["Action", "Drama"],
      tags: [],
      anilistScore: 85,
      studios: ["Wit Studio"],
      synopsis: "Humans fight titans.",
      isAdult: false,
      streamingLinks: [],
      externalLinks: [],
      cachedAt: 0,
    };
    const text = formatCatalogFacts([factFromAnime(anime)]);
    assert.match(text, /#16498/);
    assert.match(text, /Attack on Titan/);
    assert.match(text, /25 eps/);
    assert.match(text, /AniList 8\.5/);
    assert.match(text, /Wit Studio/);
  });
});
