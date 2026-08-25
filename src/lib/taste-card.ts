import { clampLines, wrapWords } from "./taste-card-text";

export interface TasteCardData {
  summary: string | null;
  /** Positive genre weights, any order — top 5 are drawn. */
  genres: Array<{ genre: string; weight: number }>;
  stats: { completed: number; avgRating: number | null; totalHours: number } | null;
}

const W = 1080;
const H = 1350;
const PAD = 72;

/**
 * Renders the shareable Taste DNA card to a PNG blob.
 * Portrait 1080×1350 — fits Instagram/Telegram stories.
 */
export async function renderTasteCardPng(data: TasteCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  // Background: deep gradient + a soft violet glow.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#17141f");
  bg.addColorStop(1, "#0a0a10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 120, 140, 0, W - 120, 140, 520);
  glow.addColorStop(0, "rgba(139, 92, 246, 0.28)");
  glow.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const font = (size: number, weight = 400) =>
    `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  let y = PAD + 20;

  // Wordmark + title.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = font(30, 600);
  ctx.fillText("A N I M E  B U D D Y", PAD, y);
  y += 108;
  ctx.fillStyle = "#ffffff";
  ctx.font = font(96, 800);
  ctx.fillText("Taste DNA", PAD, y);
  y += 88;

  // Summary blurb.
  if (data.summary) {
    ctx.font = font(38);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const lines = clampLines(wrapWords(data.summary, 42), 5, 42);
    for (const line of lines) {
      y += 56;
      ctx.fillText(line, PAD, y);
    }
    y += 30;
  }

  // Genre bars (top 5 positive weights).
  const genres = data.genres
    .filter((g) => g.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  if (genres.length > 0) {
    y += 60;
    const maxWeight = genres[0].weight;
    const barMaxW = W - PAD * 2 - 300;
    for (const g of genres) {
      ctx.font = font(34, 600);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(g.genre, PAD, y + 26);
      const barW = Math.max(24, (g.weight / maxWeight) * barMaxW);
      const barX = PAD + 260;
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, "#8b5cf6");
      grad.addColorStop(1, "#6366f1");
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(barX, y, barMaxW, 34, 17);
      ctx.fill();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(barX, y, barW, 34, 17);
      ctx.fill();
      ctx.font = font(30);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`+${g.weight.toFixed(1)}`, barX + barMaxW + 24, y + 27);
      y += 72;
    }
  }

  // Stats row pinned near the bottom.
  if (data.stats) {
    const statsY = H - PAD - 150;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, statsY - 44);
    ctx.lineTo(W - PAD, statsY - 44);
    ctx.stroke();
    const cols: Array<[string, string]> = [
      [String(data.stats.completed), "completed"],
      [data.stats.avgRating != null ? data.stats.avgRating.toFixed(1) : "—", "avg rating"],
      [`${data.stats.totalHours}h`, "watched"],
    ];
    const colW = (W - PAD * 2) / cols.length;
    cols.forEach(([value, label], i) => {
      const x = PAD + i * colW;
      ctx.font = font(64, 800);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(value, x, statsY + 40);
      ctx.font = font(28);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(label, x, statsY + 88);
    });
  }

  // Footer.
  ctx.font = font(26);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("megabomb420.github.io/anime-buddy", PAD, H - 44);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encode failed"))), "image/png");
  });
}

/** Share via the OS sheet when possible, otherwise download the PNG. */
export async function shareTasteCard(data: TasteCardData): Promise<"shared" | "downloaded"> {
  const blob = await renderTasteCardPng(data);
  const file = new File([blob], "anime-buddy-taste-dna.png", { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "My Taste DNA — Anime Buddy" });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "anime-buddy-taste-dna.png";
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
