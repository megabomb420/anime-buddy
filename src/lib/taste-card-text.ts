/**
 * Pure text helpers for the shareable Taste DNA card.
 * Kept DOM-free so they are unit-testable under plain node.
 */

/** Greedy word wrap by character budget. Overlong words are hard-split. */
export function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (rest.length > maxChars) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** Cap the line count; the last visible line ends with an ellipsis. */
export function clampLines(lines: string[], maxLines: number, maxChars: number): string[] {
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1];
  if (last.length + 1 > maxChars) {
    // Drop words until the ellipsis fits.
    while (last.length + 1 > maxChars && last.includes(" ")) {
      last = last.slice(0, last.lastIndexOf(" "));
    }
    if (last.length + 1 > maxChars) last = last.slice(0, maxChars - 1);
  }
  out[maxLines - 1] = `${last}…`;
  return out;
}
