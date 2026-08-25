import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { airingCountdownLabel, airingWeekdayLabel } from "./airing.ts";

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

describe("airingWeekdayLabel", () => {
  // Local time: Wednesday 2027-01-06, 15:00 (2027-01-01 was a Friday).
  const now = new Date(2027, 0, 6, 15, 0, 0).getTime();

  it("marks past times as out now", () => {
    assert.equal(airingWeekdayLabel(now - 1000, now), "out now");
  });

  it("same calendar day is today", () => {
    assert.equal(airingWeekdayLabel(new Date(2027, 0, 6, 20, 0, 0).getTime(), now), "today");
  });

  it("next calendar day is tomorrow, even under 24h away", () => {
    assert.equal(airingWeekdayLabel(new Date(2027, 0, 7, 9, 0, 0).getTime(), now), "tomorrow");
  });

  it("further days fall back to the short weekday", () => {
    // Saturday 2027-01-09
    assert.equal(airingWeekdayLabel(new Date(2027, 0, 9, 18, 0, 0).getTime(), now), "Sat");
    // Tuesday 2027-01-12 (6 days out, still inside the week window)
    assert.equal(airingWeekdayLabel(new Date(2027, 0, 12, 18, 0, 0).getTime(), now), "Tue");
  });
});
