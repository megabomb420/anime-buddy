import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { picksMentionedInReply, type MentionablePick } from "./buddy-card-selection.ts";

const picks: MentionablePick[] = [
  {
    anilistId: 1,
    title: {
      romaji: "Mahou Shoujo Madoka Magica Movie 4: Walpurgis no Kaiten",
      english: "Puella Magi Madoka Magica the Movie - Walpurgisnacht: Rising",
    },
  },
  { anilistId: 2, title: { romaji: "Koukaku Kidoutai", english: "Ghost in the Shell" } },
  { anilistId: 3, title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End" } },
];

describe("picksMentionedInReply", () => {
  it("shows no cards for a generic follow-up question", () => {
    const result = picksMentionedInReply(
      "Do you want something easy tonight, or something with teeth?",
      picks,
    );
    assert.deepEqual(result, []);
  });

  it("keeps only exact titles Ren discusses", () => {
    const result = picksMentionedInReply(
      "Ghost in the Shell is the cleanest one-night pick here.",
      picks,
    );
    assert.deepEqual(result.map((pick) => pick.anilistId), [2]);
  });

  it("recognises a clear shortened title, but not unrelated candidates", () => {
    const result = picksMentionedInReply(
      "I'd take Madoka Magica if you want the darker option, or Frieren for something calmer.",
      picks,
    );
    assert.deepEqual(result.map((pick) => pick.anilistId), [1, 3]);
  });
});
