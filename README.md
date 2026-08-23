# Anime Buddy

**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

**Source:** [https://github.com/megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy)

Local-first anime companion. Discover titles, keep a library, scan figurines with the camera, and talk to **Buddy** — a locked-in anime friend who will not drop character.

Your lists and taste stay on the device (IndexedDB). No accounts. No cloud library.

## What it does

| Screen | What you get |
| --- | --- |
| Home / Discover | AniList catalog, search, trending |
| Scan | Camera or photo of a figurine / character art, matched to AniList |
| Library | Watching, plan to watch, completed |
| Buddy | Chat for recs. Same DeepSeek Worker as Scan. He stays Buddy. |
| Profile | Taste, age gate, Worker URL for live vision + chat |

Catalog metadata is canonical from **AniList**. Scores/ratings may also show Jikan (MAL). AI never invents titles, scores, or streaming facts.

## Live AI (Scan + Buddy)

The PWA works without a key. Live identification and live Buddy chat need a Cloudflare Worker that holds your DeepSeek secret.

1. Deploy [`worker/`](./worker) from the Cloudflare dashboard (root directory = `worker`).
2. Add a **Secret** named `DEEPSEEK_API_KEY` — never `VITE_`, never in the repo.
3. Copy the `*.workers.dev` URL.
4. Open the app → **Profile → Scan vision** → paste → wait for **Vision ready**.

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
