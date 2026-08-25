import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimatedMinutes, fitsTimeBudget } from "./time-budget.ts";

describe("fitsTimeBudget", () => {
  it("fits a 12-episode series into 5 hours but not 2", () => {
    const show = { format: "TV", episodes: 12 };
    assert.equal(fitsTimeBudget(show, 300), true);
    assert.equal(fitsTimeBudget(show, 120), false);
  });

  it("treats movies as ~100 minutes", () => {
    const movie = { format: "MOVIE", episodes: 1 };
    assert.equal(estimatedMinutes(movie), 100);
    assert.equal(fitsTimeBudget(movie, 120), true);
    assert.equal(fitsTimeBudget(movie, 60), false);
  });

  it("never fits unknown episode counts into a finite budget", () => {
    assert.equal(fitsTimeBudget({ format: "TV" }, 999), false);
  });

  it("fits a One Piece marathon into nothing reasonable", () => {
    assert.equal(fitsTimeBudget({ format: "TV", episodes: 1100 }, 180), false);
  });
});
