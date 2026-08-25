/**
 * Attach AniList cards only to titles Ren actually names in his reply.
 * Candidates may be prepared before the chat call, but they are not UI output
 * until the response explicitly talks about them.
 */

export interface MentionablePick {
  anilistId: number;
  title: { romaji: string; english?: string; native?: string };
}

const GENERIC_WORDS = new Set([
  "anime",
  "movie",
  "film",
  "series",
  "season",
  "part",
  "episode",
  "special",
  "the",
  "and",
  "of",
  "a",
  "an",
  "no",
  "to",
  "today",
  "tomorrow",
  "tonight",
  "summer",
  "winter",
  "spring",
  "fall",
]);

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function variants(pick: MentionablePick): string[] {
  const raw = [pick.title.english, pick.title.romaji, pick.title.native].filter(
    (title): title is string => Boolean(title?.trim()),
  );
  const out = new Set<string>();
  for (const title of raw) {
    out.add(title.trim());
    for (const part of title.split(/\s+(?:[-–—]|\||:)\s+|:\s*/)) {
      if (part.trim().length >= 5) out.add(part.trim());
    }
  }
  return [...out];
}

function titleWords(pick: MentionablePick): Set<string> {
  const words = new Set<string>();
  for (const title of variants(pick)) {
    for (const word of normalize(title).split(" ")) {
      if (word.length >= 4 && !GENERIC_WORDS.has(word)) words.add(word);
    }
  }
  return words;
}

function exactWordWithTitleCase(reply: string, word: string): boolean {
  const titleCase = word.charAt(0).toUpperCase() + word.slice(1);
  const escaped = titleCase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(reply);
}

export function picksMentionedInReply<T extends MentionablePick>(
  reply: string,
  picks: T[],
  limit = 4,
): T[] {
  if (!reply.trim() || picks.length === 0) return [];
  const normalizedReply = ` ${normalize(reply)} `;
  const wordsById = new Map(picks.map((pick) => [pick.anilistId, titleWords(pick)]));
  const wordFrequency = new Map<string, number>();
  for (const words of wordsById.values()) {
    for (const word of words) wordFrequency.set(word, (wordFrequency.get(word) ?? 0) + 1);
  }

  return picks
    .filter((pick) => {
      const aliases = variants(pick).map(normalize).filter((alias) => alias.length >= 4);
      if (aliases.some((alias) => normalizedReply.includes(` ${alias} `))) return true;

      const words = [...(wordsById.get(pick.anilistId) ?? [])];
      const mentioned = words.filter((word) => normalizedReply.includes(` ${word} `));
      if (mentioned.length >= 2) return true;

      const one = mentioned[0];
      return Boolean(
        one &&
          one.length >= 6 &&
          wordFrequency.get(one) === 1 &&
          exactWordWithTitleCase(reply, one),
      );
    })
    .slice(0, limit);
}
