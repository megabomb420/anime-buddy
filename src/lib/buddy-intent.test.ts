import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretBuddyQuery, isVagueCatalogQuery, wantsRecommendation } from "./buddy-intent.ts";

describe("wantsRecommendation", () => {
  it("catches Polish and English watch asks", () => {
    assert.equal(wantsRecommendation("co oglądać wieczorem"), true);
    assert.equal(wantsRecommendation("poleć coś mrocznego"), true);
    assert.equal(wantsRecommendation("recommend a dark isekai"), true);
    assert.equal(wantsRecommendation("what should I watch tonight"), true);
  });

  it("lets factual anime questions through without recs", () => {
    assert.equal(wantsRecommendation("ile odcinków ma One Piece"), false);
    assert.equal(wantsRecommendation("kto to Lelouch"), false);
  });
});

describe("interpretBuddyQuery", () => {
  it("extracts a similar-to title", () => {
    const p = interpretBuddyQuery("poleć coś podobnego do Steins;Gate");
    assert.equal(p.context, "similar");
    assert.match(p.query, /Steins/);
  });

  it("maps a funny mood to a catalog-friendly query", () => {
    const p = interpretBuddyQuery("something funny");
    assert.equal(p.context, "mood-funny");
    assert.equal(isVagueCatalogQuery(p.query), false);
  });
});
