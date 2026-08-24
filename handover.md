# Anime Buddy — Handover

**Date:** 2026-08-24  
**App version:** `0.3.4` (see Profile → App version + `version.json` on Pages)  
**Owner repo:** [megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy) (public)  
**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

Read this before changing the product. `handoff.md` (if present) points here.

---

## Product

Anime Buddy is a **local-first, mobile-first PWA**:

- discover and track anime
- scan figurines / merch / character art with the camera
- talk to **Ren** (nickname **Buddy**) — night-owl anime companion; anime-lane only
- tell Ren what you watched — he confirms the catalog title, then writes **Library**

Auth and Neon stay **off**. Personal data is IndexedDB only.

Canonical catalog: **AniList GraphQL**. Secondary: Jikan (MAL score/rating), TMDB (availability/certs, Worker-only). AI identifies and chats; it does **not** invent titles, scores, age ratings, or streaming facts.

**No launch splash** — opens straight to home.

---

## Public addresses

| What | URL |
| --- | --- |
| **App (GitHub Pages)** | https://megabomb420.github.io/anime-buddy/ |
| **Source** | https://github.com/megabomb420/anime-buddy |
| **Worker (live)** | https://anime-buddy-worker.whip-blanket.workers.dev |
| **Version feed** | https://megabomb420.github.io/anime-buddy/version.json |
| Worker one-click | https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker |

Worker is **baked in** for Scan + Buddy. Profile can override; reset returns to the built-in origin.

---

## Versioning

- `package.json` → semver shown in UI (`0.3.4`+)
- CI injects `VITE_APP_VERSION`, `VITE_GIT_SHA` (7 chars), `VITE_BUILD_TIME`
- Each Pages deploy writes `dist/version.json` `{ version, commit, builtAt }`
- **Profile → App version** compares this install to `version.json` (no-store fetch)
  - *You have the latest build* vs *Newer build online* + Reload

Bump `package.json` version when shipping a meaningful user-facing change.

---

## Character: Ren (Buddy)

| | |
| --- | --- |
| Name | **Ren** |
| Nickname | Buddy |
| Voice | Short, dry; Polish in → Polish out |
| Lane | Anime, manga, LN, characters, figures, watch taste, scan, **Library control** |
| Off-lane | Math, code, news, homework — blocked client + Worker |

### Buddy screen (chat chrome)

Full-viewport chat — not a padded page with `min-h-[70vh]`:

- Header with safe-area (iOS notch)
- Scrolling thread
- Composer pinned **above** BottomNav
- Empty state fills the view: intro + 2-col prompt cards + “Log a title” prefixes
- New-chat control in the header; last conversation restores on return

Starter chips map to catalog rec queries (including “Popular unread” / “Short tonight”). “I finished…” / “I'm watching…” only prefix the input — they do not send until the user types a title.

### Library via chat

1. User: `oglądałem Attack on Titan` / `watching Naruto` / `chcę obejrzeć …`
2. Client parses intent (`src/lib/buddy-library.ts`) → AniList search
3. Ren asks which exact title → **Confirm** cards (`LibraryConfirmCard`)
4. Only on confirm: `persistence.setLibraryStatus`

Statuses: completed · watching · plan_to_watch · on_hold · dropped

### Spam guard (`src/lib/buddy-spam.ts`)

- Max ~12 messages / min, min gap 450ms
- Same text 3× / 30s → cooldown
- Gibberish / noise blocked before AniList or DeepSeek
- Max ~8 Library confirms / min
- Cooldown ~25s after trip


### DeepSeek (Buddy)

- Model: `deepseek-v4-flash`
- Chat: `thinking: { type: "enabled" }`, `reasoning_effort: high`, **streamed**
- Reasoning tokens stay on the Worker; the PWA never shows the chain-of-thought
- Rec / taste / signals: thinking **disabled** (JSON)
- After `worker/src/**` changes: `cd worker && npx wrangler deploy` (needs Cloudflare login or repo secrets). Live Worker as of 0.3.3 is still the old JSON chat until that deploy succeeds.

### Persona lock layers

1. Client `src/lib/buddy/persona.ts` before API
2. Worker `worker/src/persona.ts` on `POST /api/ai/chat`

Owner unlock: type `deep7717` in Buddy chat. Toggles the lock. Stored in IndexedDB settings (`personaUnlocked`) + localStorage, so it survives closing the app. Same code again re-locks. Header shows `DeepSeek · open` when off. Worker must receive `unlock` in the chat body — needs a Worker deploy to actually answer off-lane (math/code). Client lock drops immediately.

---

## Home / Featured

- Featured cycles top **8** trending titles every **45s**
- Pauses when tab hidden or `prefers-reduced-motion`
- Current featured is filtered out of the Trending row

---

## Architecture snapshot

| Concern | Choice |
| --- | --- |
| Public app | Vite + React Router, `base` `/anime-buddy/` on Pages |
| Data | Dexie / IndexedDB |
| Catalog | AniList GraphQL |
| AI | DeepSeek via Cloudflare Worker only |
| Scan | `POST /api/ai/vision` |
| Chat | `POST /api/ai/chat` |
| PWA | `vite-plugin-pwa`; SPA `404.html` |
| Launch | No splash |
| Version | Profile + `version.json` |

Secrets only in Cloudflare Worker: `DEEPSEEK_API_KEY` (required), `TMDB_API_KEY` (optional).

Never put secrets in `VITE_*`, committed `.env`, or `wrangler.toml`.

---

## Routing

| Path | Screen |
| --- | --- |
| `/` | Home (featured + trending) |
| `/discover` | Discover |
| `/scan` | Camera / figurine recognition |
| `/library` | Library |
| `/buddy` | Ren chat (+ library confirm) |
| `/profile` | Taste, Worker, **App version**, export |

---

## Deploy

### GitHub Pages

- Workflow: `.github/workflows/pages.yml`
- Push `main` → `npm ci` → inject version env → `GITHUB_PAGES=true npm run build` → write `version.json` → publish `dist/` to **`gh-pages`**

**tsc pitfall:** keep `"exclude": ["src/**/*.test.ts"]` in `tsconfig.app.json`.

### Cloudflare Worker

```bash
cd worker
npx wrangler login   # once
npx wrangler deploy
```

Persona / vision changes need a **Worker** redeploy, not only Pages.

---

## Shipped (status)

- [x] Public Pages PWA + live Worker baked in
- [x] Scan + Buddy on same DeepSeek Worker
- [x] Ren persona + jailbreak / off-lane locks
- [x] Featured rotate 45s; no splash
- [x] Library confirm flow via Ren + spam detector
- [x] App version + latest check on Profile
- [x] Buddy full-height chat (empty state fills the screen; composer above tab bar)
- [x] Buddy types replies one character at a time (caret + dots). Worker source has DeepSeek thinking on (`deepseek-v4-flash`); live Worker is still JSON until Cloudflare secrets exist.
- [x] Owner persona unlock: type `deep7717` in Buddy — persists in IndexedDB/localStorage across restarts; same code re-locks
- [x] README + this handover

---

## Verify after deploy

1. Hard-refresh the live app (clear PWA cache if stuck).
2. Profile → **App version** shows `v0.3.4` (or current) and *latest* or *update*.
3. `curl -s https://megabomb420.github.io/anime-buddy/version.json`
4. Buddy empty screen: prompt cards fill the view; composer sits on the tab bar (no black void).
5. Buddy: `oglądałem Naruto` → confirm card → appears in Library.
6. Buddy: “Something funny” → reply **plus tappable cover cards**.
7. Spam: hammer Send → Ren rate-limit line, no API spam.
8. Featured changes within ~45s on Home.

---

## Known limitations

- Persona lock is strong, not absolute.
- Library control is intent-regex + catalog search, not free-form LLM tool-calling.
- Spam guard is **client-side** (per browser tab memory).
- Pages and Worker are two deploys.
- **Live Worker** (`anime-buddy-worker`) still returns JSON `{reply}` (no thinking, no SSE). Thinking + stream are in `worker/src/index.ts` but Actions cannot deploy without repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Until then the PWA typewrites the JSON reply so it still looks like Ren is typing.
- Hardware camera QA still light; file upload is the main Scan path tested.
