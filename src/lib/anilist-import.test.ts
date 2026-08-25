import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapAniListStatus } from "./anilist-import.ts";

describe("mapAniListStatus", () => {
  it("maps the six AniList statuses", () => {
    assert.deepEqual(mapAniListStatus("CURRENT"), { status: "watching", rewatch: false });
    assert.deepEqual(mapAniListStatus("REPEATING"), { status: "watching", rewatch: true });
    assert.deepEqual(mapAniListStatus("PLANNING"), { status: "plan_to_watch", rewatch: false });
    assert.deepEqual(mapAniListStatus("COMPLETED"), { status: "completed", rewatch: false });
    assert.deepEqual(mapAniListStatus("DROPPED"), { status: "dropped", rewatch: false });
    assert.deepEqual(mapAniListStatus("PAUSED"), { status: "on_hold", rewatch: false });
  });

  it("is case-insensitive and safe on unknown values", () => {
    assert.equal(mapAniListStatus("current").status, "watching");
    assert.equal(mapAniListStatus("SOMETHING_NEW").status, "plan_to_watch");
  });
});
