import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allowsUpcomingTitles, isWatchableNow } from "./recommendation-constraints.ts";

describe("recommendation constraints", () => {
  it("keeps future titles out of normal watch-now asks", () => {
    assert.equal(isWatchableNow({ status: "NOT_YET_RELEASED" }), false);
    assert.equal(isWatchableNow({ status: "RELEASING" }), true);
    assert.equal(isWatchableNow({ status: "FINISHED" }), true);
  });

  it("allows upcoming catalog requests explicitly", () => {
    assert.equal(allowsUpcomingTitles("what should I watch tonight"), false);
    assert.equal(allowsUpcomingTitles("show me upcoming anime premieres"), true);
    assert.equal(allowsUpcomingTitles("nadchodzące premiery"), true);
  });
});
