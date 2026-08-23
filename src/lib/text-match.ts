export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, " ")
    .replace(/\b(the|a|an|season|ova|movie|tv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const aTokens = new Set(left.split(" ").filter(Boolean));
  const bTokens = new Set(right.split(" ").filter(Boolean));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  const union = aTokens.size + bTokens.size - overlap;
  return union === 0 ? 0 : overlap / union;
}
