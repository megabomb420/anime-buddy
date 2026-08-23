# Anime Buddy

**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

**Source:** [https://github.com/megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy)

**Live Worker (Scan + Buddy):** [https://anime-buddy-worker.whip-blanket.workers.dev](https://anime-buddy-worker.whip-blanket.workers.dev)

Local-first anime companion. Discover titles, keep a library, scan figurines with the camera, and talk to **Buddy** — a locked-in anime friend who will not drop character.

Your lists and taste stay on the device (IndexedDB). No accounts. No cloud library.

## What it does

| Screen | What you get |
| --- | --- |
| Home / Discover | AniList catalog, search, trending |
| Scan | Camera or photo of a figurine / character art, matched to AniList |
| Library | Watching, plan to watch, completed |
| Buddy | Chat for recs. Same DeepSeek Worker as Scan. He stays Buddy. |
| Profile | Taste, age gate, Worker status (override only if you move it) |

Catalog metadata is canonical from **AniList**. Scores/ratings may also show Jikan (MAL). AI never invents titles, scores, or streaming facts.

## Live AI (Scan + Buddy)

Scan identification and Buddy chat are **already wired** to:

`https://anime-buddy-worker.whip-blanket.workers.dev`

The DeepSeek key stays a Cloudflare Worker secret — never in this repo, never `VITE_`. You do not paste a Worker URL to use Scan or Buddy.

To run your own Worker instead: deploy [`worker/`](./worker), add secret `DEEPSEEK_API_KEY`, then override the address in **Profile → Scan + Buddy**.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker)

## Run it yourself

```bash
npm install
npm run dev
```

Build for GitHub Pages:

```bash
GITHUB_PAGES=true npm run build
```

## Docs

- [handover.md](./handover.md) — architecture, persona lock, deploy, what to do next
- [worker/README.md](./worker/README.md) — Worker dashboard setup
