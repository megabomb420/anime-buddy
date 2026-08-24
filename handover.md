# Anime Buddy — Handover

**Date:** 2026-08-24  
**Owner repo:** [megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy) (public)  
**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

Read this before changing the product. `handoff.md` (if present) points here.

---

## Product

Anime Buddy is a **local-first, mobile-first PWA**:

- discover and track anime
- scan figurines / merch / character art with the camera
- talk to **Ren** (nickname **Buddy**) — night-owl anime companion; he stays on the anime lane and resists jailbreaks / off-topic (math, code, trivia)

Auth and Neon stay **off**. Personal data is IndexedDB only.

Canonical catalog: **AniList GraphQL**. Secondary: Jikan (MAL score/rating), TMDB (availability/certs, Worker-only). AI identifies and chats; it does **not** invent titles, scores, age ratings, or streaming facts.

---

## Public addresses

| What | URL |
| --- | --- |
| **App (GitHub Pages)** | https://megabomb420.github.io/anime-buddy/ |
| **Source** | https://github.com/megabomb420/anime-buddy |
| **Worker (live)** | https://anime-buddy-worker.whip-blanket.workers.dev |
| Worker one-click | https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker |

Worker is **baked in** for Scan + Buddy (`DEFAULT_WORKER_URL` / build env). Profile can still override; reset returns to the built-in origin.

Do **not** invent a `*.grok.me` host for the public product. The public PWA is GitHub Pages.

---

## Character: Ren (Buddy)

| | |
| --- | --- |
| Name | **Ren** |
| Nickname | Buddy (app tab / product name) |
| Voice | Short, dry, opinionated; Polish in → Polish out |
| Lane | Anime, manga, LN, characters, figures, what to watch, taste, scan results |
| Off-lane | Math, code, news, homework, recipes, random trivia — **do not answer the substance** |

### Lock layers (both required)

1. **Client** — `src/lib/buddy/persona.ts`  
   - `blockUser()` / `isJailbreakAttempt()` / `isOffLane()` run **before** any DeepSeek call  
   - `BuddyChatService.replyAsBuddy` returns locked / off-lane replies locally

2. **Worker** — `worker/src/persona.ts` + `worker/src/index.ts`  
   - Same lock on `POST /api/ai/chat`  
   - System prompt is **server-owned** (never taken from the client)

After changing persona files, you must:

- ship the **client** via GitHub Pages (`push` to `main`), and  
- **redeploy the Worker** (`cd worker && npx wrangler deploy`)

Smoke test Worker:

```bash
curl -s -X POST https://anime-buddy-worker.whip-blanket.workers.dev/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ile jest 3131231 + 232131"}]}'
# expect: Jestem Ren, nie kalkulator… (no sum)
```

---

## Architecture snapshot

| Concern | Choice |
| --- | --- |
| Public app | Vite + React Router, `base` `/anime-buddy/` on Pages |
| Data | Dexie / IndexedDB on device |
| Catalog | AniList GraphQL |
| AI | DeepSeek via Cloudflare Worker only (key never in frontend) |
| Scan | `POST /api/ai/vision` on Worker |
| Chat | `POST /api/ai/chat` on Worker |
| PWA | `vite-plugin-pwa`; SPA fallback `dist/404.html` |

Secrets live only in Cloudflare Worker Variables/Secrets:

- `DEEPSEEK_API_KEY` (required for Scan + Buddy)
- `TMDB_API_KEY` (optional)

Never put secrets in `VITE_*`, committed `.env`, or `wrangler.toml`.

---

## Routing (public PWA)

| Path | Screen |
| --- | --- |
| `/` | Home (featured hero + trending posters) |
| `/discover` | Discover (`?q=` pre-fills search) |
| `/scan` | Camera / figurine recognition |
| `/library` | Library |
| `/buddy` | Ren chat |
| `/profile` | Taste, age gate, Worker status / override |

---

## Deploy

### GitHub Pages (app)

- Workflow: [`.github/workflows/pages.yml`](./.github/workflows/pages.yml)
- On `push` to `main`: `npm ci` → `GITHUB_PAGES=true npm run build` → publish `dist/` to **`gh-pages`**
- Live: https://megabomb420.github.io/anime-buddy/

**Known build pitfall:** do not leave `*.test.ts` under `src/` without excluding them. `tsc -b` failed on `src/lib/buddy/persona.test.ts` (`node:test` types). Fix is already in `tsconfig.app.json`:

```json
"exclude": ["src/**/*.test.ts"]
```

If Pages looks stale after a failed run, check Actions → **Deploy GitHub Pages**; only successful runs update `gh-pages`.

### Cloudflare Worker (AI)

```bash
cd worker
npx wrangler login   # once
npx wrangler deploy
```

Dashboard: Workers → `anime-buddy-worker` → Settings → Variables and Secrets → `DEEPSEEK_API_KEY`.

As of **2026-08-24**, Worker was redeployed with Ren + off-lane lock (math returns the calculator line, not a sum).

---

## What was shipped (status)

- [x] Public repo + GitHub Pages PWA
- [x] Scan (camera + file) via Worker vision
- [x] Buddy/Ren chat on the same DeepSeek Worker
- [x] Default Worker URL baked into the client
- [x] Cinematic home (featured + trending), splash, motion polish
- [x] Ren persona + client/Worker jailbreak + off-lane blocks
- [x] README + this handover
- [x] Discover live search: suggestions (covers) after 2 letters
- [x] Ren recs: catalog cards with cover + in-app link (no invented titles)

---

## What the next owner should verify

1. Hard-refresh https://megabomb420.github.io/anime-buddy/ (clear PWA cache if needed).
2. Buddy → math question → Ren deflection, no numbers.
3. Buddy → “co oglądać wieczorem” → in-character anime reply **plus tappable cover cards**.
4. Discover → type two letters (e.g. `na`, `at`) → cover suggestions drop down; tap opens the title.
5. Scan with a figurine photo → vision path returns candidates (needs live DeepSeek key).
6. After any `worker/src/**` change: `wrangler deploy` again.

Optional later:

- Repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` for Actions-based Worker deploy
- Hardware camera QA on a real phone (file-upload path was the main test path)
- Stronger Polish UI copy; seasonal recs with posters; continue-watching row

---

## Known limitations

- Persona lock is **high-precision, not unbreakable**. Do not claim 100%.
- Client lock covers the PWA UX; Worker lock covers the API. Keep both in sync.
- Recommendations must not invent titles; catalog picks only when available. Ren recs render **cover + `/anime/:id` link** under the bubble.
- Discover search is live from **2 characters** (local cache first, then AniList, debounced). `?q=` still pre-fills.
- TMDB is optional; without `TMDB_API_KEY`, availability/certs paths stay limited.
- GitHub Pages and Worker are **two deploys**. Fixing only one leaves the other stale.

---

## Quick quality checks

```bash
npm ci
npm run build          # must stay green (Pages CI)
# optional local tests (Node):
node --experimental-strip-types --test src/lib/buddy/persona.test.ts src/lib/buddy-intent.test.ts
```

Worker health:

```bash
curl -s https://anime-buddy-worker.whip-blanket.workers.dev/api/health
```
