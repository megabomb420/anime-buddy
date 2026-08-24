/** Reveal Buddy replies as if Ren is typing. Honors reduced-motion. */

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Per-character cadence. Slow enough that a short bubble is visibly typed. */
export function pauseFor(ch: string): number {
  if (/[.!?…]/.test(ch)) return 210;
  if (/[,;:]/.test(ch)) return 120;
  if (ch === "\n") return 170;
  if (ch === " ") return 38;
  return 44;
}

/** Dots stay up before a one-shot (JSON) reply starts typing. */
const WINDUP_MS = 640;

export async function typeOut(text: string, onTick: (shown: string) => void): Promise<void> {
  if (!text) {
    onTick("");
    return;
  }
  if (reducedMotion()) {
    onTick(text);
    return;
  }
  await sleep(WINDUP_MS);
  let i = 0;
  while (i < text.length) {
    i += 1;
    onTick(text.slice(0, i));
    await sleep(pauseFor(text[i - 1] ?? ""));
  }
}

/** Type at a human pace while chunks (stream or one-shot) arrive. */
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
      shown = target.slice(0, shown.length + 1);
      onTick(shown);
      await sleep(pauseFor(shown[shown.length - 1] ?? ""));
    } else {
      await sleep(40);
    }
  }

  await consume;
  if (fail) throw fail;
  onTick(target);
  return target;
}
