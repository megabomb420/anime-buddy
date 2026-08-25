import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { airingCountdownLabel } from "./airing.ts";

const H = 3_600_000;
const D = 24 * H;

describe("airingCountdownLabel", () => {
  const now = 1_800_000_000_000;

  it("marks past times as out now", () => {
    assert.equal(airingCountdownLabel(now - 1000, now), "out now");
  });

  it("hours under a day", () => {
    assert.equal(airingCountdownLabel(now + 30 * 60_000, now), "in <1h");
    assert.equal(airingCountdownLabel(now + 5 * H, now), "in 5h");
  });

  it("tomorrow and days", () => {
    assert.equal(airingCountdownLabel(now + 30 * H, now), "tomorrow");
    assert.equal(airingCountdownLabel(now + 3 * D, now), "in 3d");
  });

  it("weeks beyond a week", () => {
    assert.equal(airingCountdownLabel(now + 8 * D, now), "in 1w");
    assert.equal(airingCountdownLabel(now + 21 * D, now), "in 3w");
  });
});
