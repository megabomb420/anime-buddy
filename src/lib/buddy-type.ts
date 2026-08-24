/** Reveal Buddy replies as if Ren is typing. Honors reduced-motion. */

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pauseFor(ch: string): number {
  if (/[.!?…]/.test(ch)) return 72;
  if (/[,;:]/.test(ch)) return 36;
  if (ch === "\n") return 48;
  return 17;
}

export async function typeOut(text: string, onTick: (shown: string) => void): Promise<void> {
  if (!text) {
    onTick("");
    return;
  }
  if (reducedMotion()) {
    onTick(text);
    return;
  }
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    const n = /[\s\n]/.test(ch) ? 1 : 2 + (i % 2 === 0 ? 1 : 0);
    i = Math.min(text.length, i + n);
    onTick(text.slice(0, i));
    await new Promise((r) => setTimeout(r, pauseFor(text[i - 1] ?? "")));
  }
}

/** Type at a steady pace while chunks (stream or one-shot) arrive. */
export async function typeFromChunks(
  chunks: AsyncIterable<string>,
  onTick: (shown: string) => void,
): Promise<string> {
  if (reducedMotion()) {
    let full = "";
    for await (const c of chunks) full += c;
    onTick(full);
    return full;
  }

  let target = "";
  let shown = "";
  let done = false;
  let fail: unknown;

  const consume = (async () => {
    try {
      for await (const c of chunks) target += c;
    } catch (e) {
      fail = e;
    } finally {
      done = true;
    }
  })();

  while (!done || shown.length < target.length) {
    if (shown.length < target.length) {
      const left = target.length - shown.length;
      const n = Math.min(left, left > 28 ? 4 : 2);
      shown = target.slice(0, shown.length + n);
      onTick(shown);
      await new Promise((r) => setTimeout(r, pauseFor(shown[shown.length - 1] ?? "")));
    } else {
      await new Promise((r) => setTimeout(r, 28));
    }
  }

  await consume;
  if (fail) throw fail;
  onTick(target);
  return target;
}
