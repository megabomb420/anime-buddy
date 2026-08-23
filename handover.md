# Anime Buddy — Handover

**Date:** 2026-08-23
**Owner repo:** [megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy) (public)
**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

This is the file to read before changing the product. `handoff.md` is a pointer here.

---

## Product

Anime Buddy is a **local-first, mobile-first PWA**:

- discover and track anime
- scan figurines / merch / character art with the camera
- talk to **Buddy**, a masculine (he/him) anime companion who must not be jailbroken out of character

Auth and Neon stay **off**. Personal data is IndexedDB only.

Canonical catalog: **AniList GraphQL**. Secondary: Jikan (MAL score/rating), TMDB (availability/certs, Worker-only). AI identifies and chats; it does not invent titles, scores, age ratings, or Crunchyroll facts.

---

## Public addresses

| What | URL |
| --- | --- |
| **App (GitHub Pages)** | https://megabomb420.github.io/anime-buddy/ |
| **Source** | https://github.com/megabomb420/anime-buddy |
| Worker one-click | https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker |
| Worker (after user deploys) | `https://anime-buddy-worker.<account>.workers.dev` — paste in Profile → Scan vision |

Do **not** invent a `*.grok.me` host. Grok App Builder deploys to Vercel/`{name}.grok.me` from the platform; this agent cannot trigger that. The public PWA is GitHub Pages.

The in-chat live preview is a **TanStack Start** port of the same product (see two codebases below). It is not the public URL.

---

## Two codebases

| | GitHub (`megabomb420/anime-buddy`) | Grok preview (`/workspace`) |
| --- | --- | --- |
| Role | **Public product** | In-chat preview / iteration |
| Router | Vite + React Router 7 (`BrowserRouter`) | TanStack Start / file routes |
| DB | Dexie via `@/lib/db` | Dexie via `src/lib/local-db/` |
| Vision | Cloudflare Worker only | `analyzeVisionFn` **or** Worker if URL set |
| Chat | Worker DeepSeek, else in-character mock | Same |
| PWA | `vite-plugin-pwa`, `base` `/anime-buddy/` on Pages | Platform PWA injector |
| Dev | `npm run dev` (port 3000) | `npm run dev` on `0.0.0.0:8080` |

Keep behavior aligned: Scan JSON shape, AniList as canonical, Buddy persona lock, Worker URL in Profile.

---

## Routing (public PWA)

| Path | Screen |
| --- | --- |
| `/` | Home |
| `/discover` | Discover (`?q=` pre-fills search) |
| `/scan` | Camera / figurine recognition |
| `/library` | Library |
| `/buddy` | Buddy chat |
| `/profile` | Profile |
| `/anime/:anilistId` | Anime detail |
| `/characters` | Character search |
| `/character/:characterId` | Character detail |

Mobile bottom nav: Home / Discover / **Scan (center)** / Library / Buddy.

GitHub Pages is a project site, so Vite `base` is `/anime-buddy/` in CI (`GITHUB_PAGES=true`) and `BrowserRouter` uses that basename. `dist/404.html` is a copy of `index.html` so client routes survive refresh.

---

## Scan / vision

```
User opens Scan
  → getUserMedia (rear camera) or file picker
  → JPEG capture
  → compress (max 1280px, quality 0.82)
  → POST Worker /api/ai/vision   (model: deepseek-v4-flash-vision-exp)
  → VisualRecognitionResult JSON
  → AniList search (catalog is canonical)
  → result sheet: confidence band + catalog matches
```

Captures are **not** persisted. The DeepSeek key is **never** `VITE_` and never in the client. xAI is **not** a vision fallback.

Confidence bands: high / likely / ambiguous / none. Never treat a low-confidence guess as fact.

If the Worker URL or secret is missing, Scan still opens. Identification returns `not_configured` with a recovery path.

In-app connect: **Profile → Scan vision** (paste-first `VisionGatewayCard`). Stored in `localStorage` key `anime-buddy.worker-url`.

---

## Buddy persona lock

Buddy is a **person** in the app (he/him). The lock is defense in depth — not a cryptographic guarantee.

1. **Server-owned system prompt** on the Worker (`worker/src/persona.ts`). The client cannot replace it.
2. **Sanitize** incoming messages: drop injected `system` roles, cap 12 turns / 2000 chars.
3. **Jailbreak detector** (EN + PL) runs locally **and** on the Worker. Hits get a locked reply, no catalog cards.
4. **Output leak guard**: if the model names a vendor/model or echoes a hijack, replace with the locked reply.
5. **Mock path** (no Worker) still answers in character via `mockBuddyReply`.

Locked replies:

- EN: `Cute try. I'm Buddy. What are we watching?`
- PL: `Niezły strzał. Zostaję Buddy. Co oglądamy?`

Chat **and** Scan share the same Worker + `DEEPSEEK_API_KEY`. Chat model: `deepseek-chat`. There is no xAI Buddy fallback.

Skip `resolveRecs` / catalog chips when `isJailbreakAttempt(text)` is true.

Tests: `src/lib/buddy/persona.test.ts` (workspace). Keep them green if you touch the detector.

---

## Worker

Folder: `worker/` (Cloudflare Worker `anime-buddy-worker`).

| Route | Purpose |
| --- | --- |
| `GET /api/health` | `{ ok, vision, tmdb }` |
| `POST /api/ai/chat` | Buddy — server system prompt + sanitize + lock |
| `POST /api/ai/recommend` | Semantic rerank of a candidate pool |
| `POST /api/ai/taste` | Taste DNA |
| `POST /api/ai/signals` | Taste signals from notes |
| `POST /api/ai/vision` | Scan (DeepSeek V4 Flash). `503` if secret missing |
| `GET /api/tmdb/*` | TMDB passthrough |

Secrets (dashboard → Settings → Variables and Secrets only):

```
DEEPSEEK_API_KEY     # required for Scan + live Buddy
TMDB_API_KEY         # optional, availability/certs
```

`ALLOWED_ORIGINS=*` is in `wrangler.toml` so Pages + preview origins work. Do not put keys in `[vars]`.

CLI deploy is optional (`wrangler-action` workflow is `workflow_dispatch` and needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets). Dashboard import is the path we told the user.

---

## Data flow

1. UI talks to `services/*` and persistence — not Dexie, not providers directly
2. Catalog cache + personal data live in IndexedDB
3. Worker is the only place `DEEPSEEK_API_KEY` is read
4. AniList is canonical for ids, covers, titles, metadata

---

## Environment

App (never commit secrets):

```
VITE_WORKER_URL=          # optional; Profile paste overrides in the browser
VITE_AI_PROVIDER=mock     # mock | deepseek; a Worker URL implies live DeepSeek
```

---

## Deploy

**Public PWA** — GitHub Pages from the `gh-pages` branch:

- Live: https://megabomb420.github.io/anime-buddy/
- Workflow [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) builds on `push` to `main` (`GITHUB_PAGES=true`) and publishes `dist/` to `gh-pages`
- The GitHub App token **cannot** call “Create a Pages site”. Pushing `gh-pages` is what turned Pages on (`source.branch=gh-pages`)
- SPA refreshes use `dist/404.html` (copy of `index.html`)

**Worker** — Cloudflare dashboard, root = `worker`, then add `DEEPSEEK_API_KEY`. Redeploy after `worker/src/**` changes so the persona lock is live.

**Grok / Vercel** — platform-side; not triggered from this handover.


---

## What was already shipped

- Public GitHub repo `megabomb420/anime-buddy`
- Scan camera + file path + Worker vision
- In-app Worker URL card (paste-first)
- Buddy persona lock (client + Worker)
- Buddy chat on the same DeepSeek Worker as Scan
- README with the live app address
- GitHub Pages workflow

---

## What the next person / owner must do

1. Live app loads: https://megabomb420.github.io/anime-buddy/
2. Deploy / redeploy the Worker from `worker/` on Cloudflare.
3. Put `DEEPSEEK_API_KEY` in Worker secrets.
4. Open the live app → Profile → Scan vision → paste the `*.workers.dev` URL until **Vision ready**.
5. Optional: repo secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` if you want Actions to deploy the Worker.
6. Hardware camera was not QA’d on a physical phone. File-upload path was.


---

## Known limitations

- Live vision/chat need the user-owned DeepSeek key in Cloudflare. This environment does not hold that key.
- Persona lock is high-precision, not unbreakable. Do not claim 100%.
- GitHub `BuddyPage` is slimmer than the Grok preview (preview can attach catalog chips; skip them on jailbreak).
- Recommendations do not require verified Crunchyroll (the pool would be empty without TMDB).
- `kimi-plugin-inspect-react` is still in the GitHub Vite config from an earlier scaffold; leave it unless it breaks CI.

---

## Tests / quality (preview workspace)

- `npx tsc --noEmit`
- `node --experimental-strip-types --test src/lib/buddy/persona.test.ts`
- Production `npm run build` must stay green (Vercel contract on the preview app)

Do not put secrets in `VITE_` vars, `.env`, or `wrangler.toml`.
