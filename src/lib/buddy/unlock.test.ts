import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPersonaUnlockCode, PERSONA_UNLOCK_CODE } from "./unlock.ts";

describe("isPersonaUnlockCode", () => {
  it("matches the owner code, ignoring case and space", () => {
    assert.equal(isPersonaUnlockCode(PERSONA_UNLOCK_CODE), true);
    assert.equal(isPersonaUnlockCode("  DEEP7717  "), true);
    assert.equal(isPersonaUnlockCode("deep7718"), false);
    assert.equal(isPersonaUnlockCode("ile jest 2+2"), false);
  });
});
