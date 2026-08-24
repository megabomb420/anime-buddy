import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLibraryIntent } from "./buddy-library.ts";

describe("parseLibraryIntent", () => {
  it("parses Polish completed watch", () => {
    const intent = parseLibraryIntent("oglądałem Attack on Titan");
    assert.ok(intent);
    assert.equal(intent?.status, "completed");
    assert.match(intent?.query ?? "", /Attack on Titan/i);
  });

  it("parses English watching", () => {
    const intent = parseLibraryIntent("I'm watching Naruto");
    assert.ok(intent);
    assert.equal(intent?.status, "watching");
    assert.match(intent?.query ?? "", /Naruto/i);
  });

  it("parses plan to watch", () => {
    const intent = parseLibraryIntent("chcę obejrzeć Steins;Gate");
    assert.ok(intent);
    assert.equal(intent?.status, "plan_to_watch");
  });

  it("ignores rec asks", () => {
    assert.equal(parseLibraryIntent("co oglądać wieczorem"), null);
    assert.equal(parseLibraryIntent("Something funny"), null);
  });
});
