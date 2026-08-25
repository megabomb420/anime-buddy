import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLines, wrapWords } from "./taste-card-text.ts";

describe("wrapWords", () => {
  it("wraps on word boundaries within the budget", () => {
    assert.deepEqual(wrapWords("quiet warm melancholy stories", 14), [
      "quiet warm",
      "melancholy",
      "stories",
    ]);
  });

  it("returns a single line when everything fits", () => {
    assert.deepEqual(wrapWords("short text", 40), ["short text"]);
  });

  it("hard-splits words longer than the budget", () => {
    assert.deepEqual(wrapWords("supercalifragilistic", 8), ["supercal", "ifragili", "stic"]);
  });

  it("collapses extra whitespace and empty input", () => {
    assert.deepEqual(wrapWords("  a   b  ", 10), ["a b"]);
    assert.deepEqual(wrapWords("   ", 10), []);
  });
});

describe("clampLines", () => {
  it("leaves short input untouched", () => {
    assert.deepEqual(clampLines(["one", "two"], 3, 20), ["one", "two"]);
  });

  it("truncates with an ellipsis on the last visible line", () => {
    const out = clampLines(["alpha", "beta", "gamma", "delta"], 2, 20);
    assert.deepEqual(out, ["alpha", "beta…"]);
  });

  it("drops words until the ellipsis fits the budget", () => {
    const out = clampLines(["aaaaaaaa bbbb", "cccc"], 1, 10);
    assert.equal(out[0], "aaaaaaaa…");
    assert.ok(out[0].length <= 10);
  });

  it("hard-trims a single overlong word", () => {
    const out = clampLines(["abcdefghijklm", "extra"], 1, 6);
    assert.equal(out[0], "abcde…");
    assert.ok(out[0].length <= 6);
  });
});
