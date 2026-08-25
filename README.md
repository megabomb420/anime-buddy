# Anime Buddy

**Live:** [megabomb420.github.io/anime-buddy](https://megabomb420.github.io/anime-buddy/) · **v0.3.34**

**Source:** [github.com/megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy)

**Worker (Scan + Buddy):** [anime-buddy-worker.whip-blanket.workers.dev](https://anime-buddy-worker.whip-blanket.workers.dev)

Local-first, mobile-first PWA. Discover anime, keep a library, scan figurines, talk to **Ren** (tab name: **Buddy**). Lists and taste stay on the device (IndexedDB). No accounts. No cloud library.

UI chrome is **English**. Ren still answers Polish in Polish.

## Screens

| Screen | What you get |
| --- | --- |
| **Home** | Featured hero (rotates every 10s with a slow cover zoom-in, swipe left/right or dots to jump, **Open title** → detail, **Ask Ren** → Buddy with a pre-filled question), trending, **For you** (scored from ratings + library + AniList recs — reason under each poster, Refresh for new picks, Interested / Not for me feedback — “Not for me” hides the title permanently), **This week** (next episodes of everything you watch or plan to watch, airing within 7 days — “Ep N · Fri”), tonight picks (**time budget is enforced**: only titles that fit the selected minutes, movies ≈ 100 min, episodes × 24 min), and visible shortcuts to Taste DNA and Characters. **App version + Update** at the bottom. |
| **Discover** | Live search from 2 letters (covers). Trending / Seasonal / Popular. iOS safe-area header. |
| **Scan** | Camera or photo of a figurine / character art → AniList match. Every scan lands in **Recent scans** (photo shelf, deletable), matches offer **Ask Ren** (opens Buddy with a pre-filled question), Open anime, Character and Plan to watch. |
| **Library** | Watching, want to watch, completed. Same safe-area as Discover. Filter within your list, sort (Recent / Title / My rating / Progress), list or poster-grid view (choice remembered), next-episode countdown on airing titles. |
| **Buddy** | Full-height chat with Ren. He looks titles up on **AniList** (episodes, score, studio, characters), but a cover is attached only when Ren actually names that title. Recommendation turns make Ren choose now instead of dumping unrelated cards or only asking a follow-up. Future/unreleased titles stay out of normal watch-now requests. Persistent quick actions expose Recommend, My list, Find, Compare, Log and Rate. Library writes remain confirm-first and undoable; History reopens past chats with their rich cards. |
| **Profile** | A permanent bottom-nav destination with top shortcuts to Taste DNA, preferences, AniList import, hidden titles, Characters and backup. Taste DNA includes a genre chart, **You vs the crowd**, and a shareable 1080×1350 PNG. Also contains spoiler level, age gate, Worker override, **Import from AniList**, hidden-title management and local data export/import. |

Catalog is **AniList**. Scores may also show Jikan (MAL). AI never invents titles, scores, or streaming facts.

## Buddy (Ren)

Night-owl anime companion. Short, dry. Anime lane only — math, code, homework get a deflection, not an answer. Lock is on the **client and the Worker**.

## Live AI

Scan and Buddy are already pointed at the Cloudflare Worker. The DeepSeek key is a Worker secret — never in this repo, never `VITE_`.

To run your own Worker: deploy [`worker/`](./worker), add `DEEPSEEK_API_KEY`, then override the address in **Profile → Scan + Buddy**.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker)

## Run it

```bash
npm install
npm run dev
```

GitHub Pages build:

```bash
GITHUB_PAGES=true npm run build
```

Push to `main` publishes the PWA. Worker changes deploy separately through `.github/workflows/deploy-worker.yml`; the required Cloudflare Actions secrets are configured. `cd worker && npx wrangler deploy` remains the owner fallback. Live Worker health: `chat:"sse"`, `thinking:true`, `tools:true`.

If the phone still looks old after a deploy: clear site data for `megabomb420.github.io` (PWA service worker) and check the Home footer version.

## Docs

- **[handover.md](./handover.md)** — full agent brief: architecture, Ren router, live status, traps, next work. Read before changing the product.
- [worker/README.md](./worker/README.md) — Worker dashboard setup

Keep **README + handover** in the same commit when behavior changes.
