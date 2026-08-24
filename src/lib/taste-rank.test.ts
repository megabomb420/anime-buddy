import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTasteWeights,
  pickForYou,
  ratingToWeight,
  reasonForYou,
  topGenres,
  type TasteAnchor,
} from "./taste-rank.ts";
import type { AnimeSummary } from "../types/anime.ts";

function anime(
  id: number,
  genres: string[],
  score = 80,
  title = `Show ${id}`,
): AnimeSummary {
  return {
    anilistId: id,
    title: { romaji: title },
    genres,
    tags: [],
    anilistScore: score,
    isAdult: false,
    streamingLinks: [],
    externalLinks: [],
    cachedAt: 0,
  };
}

describe("ratingToWeight", () => {
  it("treats 10 as strong like and 1 as strong dislike", () => {
    assert.ok(ratingToWeight(10) > 0.9);
    assert.ok(ratingToWeight(1) < -0.9);
    assert.ok(Math.abs(ratingToWeight(5.5)) < 0.05);
  });
});

describe("buildTasteWeights", () => {
  it("boosts genres of highly rated completed titles", () => {
    const anchors: TasteAnchor[] = [
      { anilistId: 1, genres: ["Action", "Drama"], rating: 9, status: "completed" },
      { anilistId: 2, genres: ["Comedy"], rating: 3, status: "dropped" },
    ];
    const weights = buildTasteWeights(anchors);
    assert.ok((weights.get("action") ?? 0) > (weights.get("comedy") ?? 0));
    assert.ok((weights.get("comedy") ?? 0) < 0);
  });
});

describe("pickForYou", () => {
  it("excludes library ids and ranks matching genres first", () => {
    const weights = buildTasteWeights([
      { anilistId: 1, genres: ["Action"], rating: 9, status: "completed" },
    ]);
    const picked = pickForYou(
      [
        anime(1, ["Action"], 90, "Already in library"),
        anime(10, ["Slice of Life"], 90, "Slice"),
        anime(11, ["Action"], 75, "Action pick"),
      ],
      { weights, exclude: new Set([1]), seedBoost: new Map() },
    );
    assert.equal(picked[0]?.anilistId, 11);
    assert.equal(picked.some((p) => p.anilistId === 1), false);
  });

  it("boosts AniList recommendations from a liked seed", () => {
    const weights = buildTasteWeights([
      { anilistId: 1, genres: ["Drama"], rating: 9, status: "completed", title: "Frieren" },
    ]);
    const seedBoost = new Map<number, { score: number; because: string }>([
      [42, { score: 0.9, because: "Frieren" }],
    ]);
    const picked = pickForYou(
      [anime(42, ["Drama"], 70, "Related"), anime(43, ["Drama"], 85, "Popular drama")],
      { weights, exclude: new Set([1]), seedBoost },
    );
    assert.equal(picked[0]?.anilistId, 42);
    assert.match(reasonForYou(picked[0]!, { weights, seedBoost }), /Frieren/);
  });
});

describe("topGenres", () => {
  it("returns the strongest positive genres", () => {
    const weights = new Map([
      ["action", 1.2],
      ["comedy", 0.4],
      ["horror", -0.8],
    ]);
    assert.deepEqual(topGenres(weights, 2), ["action", "comedy"]);
  });
});
