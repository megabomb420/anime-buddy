# Anime Buddy — Handover

**Date:** 2026-08-24  
**App version:** `0.3.7` (Home footer + `version.json` on Pages)  
**Owner repo:** [megabomb420/anime-buddy](https://github.com/megabomb420/anime-buddy) (public)  
**Live app:** [https://megabomb420.github.io/anime-buddy/](https://megabomb420.github.io/anime-buddy/)

Read this before changing the product. `handoff.md` (if present) points here.

**Docs rule:** every user-facing change updates **this file and [README.md](./README.md)** in the same commit.

---

## If “nothing changed” on the phone

Most of the time the **PWA service worker** is still serving an old `index-*.js`.

1. Open Home and scroll to the bottom — you must see **`v0.3.7`** (or newer).
2. If the footer is missing or older: Safari → clear website data for `megabomb420.github.io`, or Chrome → Site settings → Clear & reset; then hard-refresh.
3. Confirm the server feed:  
   `curl -s https://megabomb420.github.io/anime-buddy/version.json`  
   should match the footer version after a successful Pages deploy.
4. From 0.3.7 the SW uses `skipWaiting` + `clientsClaim`, and `version.json` is **NetworkOnly** (not precached).

Pages deploys can be green while the installed icon still runs yesterday’s bundle until the SW updates.

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

- `package.json` → semver shown in UI
- CI injects `VITE_APP_VERSION`, `VITE_GIT_SHA` (7 chars), `VITE_BUILD_TIME`
- Each Pages deploy writes `dist/version.json` `{ version, commit, builtAt }`
- **Home footer** (`AppVersionFooter`) compares this install to `version.json`

Bump `package.json` when shipping a meaningful user-facing change.

---

## Home / Featured

- Pool: top **8** AniList trending
- Auto-advance every **45s** (pauses when the tab is hidden)
- **Dot indicators** under “Featured”; tap a dot to jump
- Still rotates when `prefers-reduced-motion` is on (only Ken Burns is reduced via CSS)
- Current featured is filtered out of the Trending row

If Featured never moves: check footer version first (stale SW), then that trending returned ≥2 titles.

---

## Character: Ren (Buddy)

| | |
| --- | --- |
| Name | **Ren** |
| Nickname | Buddy |
| Voice | Short, dry; Polish in → Polish out |
| Lane | Anime, manga, LN, characters, figures, watch taste, scan, **Library control** |
| Off-lane | Math, code, news, homework — blocked client + Worker |

### Library via chat

1. User: `oglądałem Attack on Titan` / `watching Naruto` / `chcę obejrzeć …`
2. Client parses intent (`src/lib/buddy-library.ts`) → AniList search
3. Ren asks which exact title → **Confirm** cards
4. Only on confirm: `persistence.setLibraryStatus`

### Spam guard (`src/lib/buddy-spam.ts`)

Rate limit, repeats, gibberish, confirm flood → local Ren reply, no API.

### DeepSeek

- Chat model path in Worker source: thinking + stream
- **Live Worker** may still be older JSON until `wrangler deploy` with Cloudflare secrets
- PWA typewrites replies either way

### Persona lock

Client + Worker. No unlock bypass in product builds.

---

## Architecture

| Concern | Choice |
| --- | --- |
| Public app | Vite + React Router, `base` `/anime-buddy/` |
| Data | Dexie / IndexedDB |
| Catalog | AniList GraphQL |
| AI | DeepSeek via Cloudflare Worker |
| PWA | `vite-plugin-pwa` autoUpdate, skipWaiting, clientsClaim |
| Version | Home footer + `version.json` NetworkOnly |

Secrets only in Cloudflare Worker. Never in `VITE_*` / repo.

---

## Deploy

### GitHub Pages

Push `main` → workflow builds with version env → `gh-pages`.

### Worker

```bash
cd worker && npx wrangler deploy
```

Needs login or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

---

## Verify

1. Home footer = `v0.3.7` (or current `version.json`).
2. Featured dots appear; auto-change ≤45s or tap a dot.
3. Buddy library confirm + spam still behave as before.
4. After Worker code changes, redeploy Worker separately.

---

## Known limitations

- Stale **installed PWA** is the #1 “deploy didn’t work” report.
- Persona lock is strong, not absolute.
- Library control is regex + catalog search, not LLM tools.
- Spam guard is client-side only.
- Live Worker thinking/SSE depends on a successful Cloudflare deploy.
