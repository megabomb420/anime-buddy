import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pauseFor } from "./buddy-type.ts";

describe("pauseFor", () => {
  it("lingers on sentence end", () => {
    assert.equal(pauseFor("."), 210);
    assert.equal(pauseFor("!"), 210);
    assert.equal(pauseFor("?"), 210);
  });

  it("is slower than a dump for letters", () => {
    assert.ok(pauseFor("a") >= 40);
    assert.ok(pauseFor(" ") >= 30);
  });
});
