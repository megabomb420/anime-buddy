# Anime Buddy

**Live:** [megabomb420.github.io/anime-buddy](https://megabomb420.github.io/anime-buddy/) · **v0.3.19**

**Source:** [github.com/megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy)

**Worker (Scan + Buddy):** [anime-buddy-worker.whip-blanket.workers.dev](https://anime-buddy-worker.whip-blanket.workers.dev)

Local-first, mobile-first PWA. Discover anime, keep a library, scan figurines, talk to **Ren** (tab name: **Buddy**). Lists and taste stay on the device (IndexedDB). No accounts. No cloud library.

UI chrome is **English**. Ren still answers Polish in Polish.

## Screens

| Screen | What you get |
| --- | --- |
| **Home** | Featured hero (rotates every 10s with a slow cover zoom-in, swipe left/right or dots to jump, **Open title** → detail, **Ask Ren** → Buddy with a pre-filled question), trending, **For you** (scored from ratings + library + AniList recs — reason under each poster, Refresh for new picks, Interested / Not for me feedback), tonight picks. **App version + Update** at the bottom. |
| **Discover** | Live search from 2 letters (covers). Trending / Seasonal / Popular. iOS safe-area header. |
| **Scan** | Camera or photo of a figurine / character art → AniList match |
| **Library** | Watching, want to watch, completed. Same safe-area as Discover. |
| **Buddy** | Full-height chat with Ren. He looks titles up on **AniList** (episodes, score, studio, characters) and drops tappable covers. `I finished Attack on Titan…` → confirm. `I finished Naruto, Bleach and One Piece` → one confirm per title. `what am I watching` → your Library (no DeepSeek). `znajdź Spy x Family` → catalog cards. `compare Naruto and Bleach` / `Naruto vs Bleach` → side-by-side AniList facts. Replies type out. Long chats send a compact recap of earlier turns, not the whole history. |
| **Profile** | Taste DNA (Worker blurb on Rebuild), spoiler level, age gate, Worker override, data export. |

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

Push to `main` publishes the PWA. Worker is a **separate** deploy (`cd worker && npx wrangler deploy`). Live Worker health: `chat:"sse"`, `thinking:true`, `tools:true`. GitHub Actions Worker deploy still needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

If the phone still looks old after a deploy: clear site data for `megabomb420.github.io` (PWA service worker) and check the Home footer version.

## Docs

- **[handover.md](./handover.md)** — full agent brief: architecture, Ren router, live status, traps, next work. Read before changing the product.
- [worker/README.md](./worker/README.md) — Worker dashboard setup

Keep **README + handover** in the same commit when behavior changes.
