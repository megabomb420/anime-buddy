# Anime Buddy — Handover (for the next agent)

**Date:** 2026-08-25  
**App version:** `0.3.28` (live)  
**HEAD:** `main` @ 0.3.20 (see `git log -1`)  
**Live PWA:** https://megabomb420.github.io/anime-buddy/  
**Source:** https://github.com/megabomb420/anime-buddy  
**Worker:** https://anime-buddy-worker.whip-blanket.workers.dev  

**Read this file before any non-trivial change.** `handoff.md` only points here.  
**Docs rule:** user-facing behavior change → update this file **and** README in the same commit.

---

## What you are

Coding agent for Anime Buddy. Continue from `main`. Prefer small shippable commits. Match existing TypeScript/React. No new frameworks.

UI chrome is **English**. Ren may answer Polish in Polish.

---

## Product (non-negotiable)

Local-first mobile PWA: Discover, Library, Scan (vision), Buddy chat (**Ren**).

- User data **ONLY** in IndexedDB. No accounts. No cloud library.
- Catalog facts **ONLY** from AniList (Jikan secondary for MAL extras). AI never invents titles, scores, episodes, or streaming.
- DeepSeek **ONLY** via Cloudflare Worker (never in the client, never `VITE_*`, never committed).
- Keys live as Worker secrets only.

---

## Ren (Buddy) router — do not break this

Order in `src/pages/BuddyPage.tsx` `send()`:

1. **WRITE** — library / rate / progress (incl. comma / `and` / `i` lists) → AniList search → Confirm cards → IndexedDB. **No DeepSeek.**
2. **LIBRARY READ** — `what am I watching` / `co oglądam` / `my library` → IndexedDB cards. **No DeepSeek.**
3. **LOOKUP** — `znajdź` / `find` / bare title → catalog cards. **No DeepSeek.** Compare runs here too, checked **before** bare-title: `compare X and Y` / `porównaj X z Y` / bare `X vs Y` → both sides resolved via `resolveTitleMatch` → side-by-side `CompareCard` (AniList facts only).
4. **CHAT** — rec / facts / free talk → PWA prefetches AniList (`buddy-catalog.ts`) + optional `RecommendationService` → stream DeepSeek with `catalogFacts` / `libraryBrief` / `tasteSummary` / `spoilerLimits`. Long chats go through `buddy-session.ts` first: turns older than the last 11 collapse into one `[Earlier in this chat — recap]` message (deterministic — only echoes parsed user intents), so the Worker never sees more than 12 messages.

Persona lock: client (`src/lib/buddy/persona.ts`) **and** Worker (`worker/src/persona.ts`). Keep them in sync. Spam guard is client-side. User must confirm all library/rating writes.

When debugging “Buddy doesn’t find X”: catalog-search normalization (`×`/`x`), intent router order, then stale PWA/version.

---

## Live status (verified 2026-08-24)

| Surface | State |
| --- | --- |
| Pages | **v0.3.28** — `version.json` must match `package.json` |
| Worker `/api/health` | `{ ok, vision:true, tmdb:false, chat:"sse", thinking:true, tools:true, catalog:"anilist" }` |
| Worker tools | Live (CLI deploy). Persona includes spoiler lock. |
| Worker GitHub Action | **Green since 2026-08-24** (run attempt 3, commit `9de5d10`). Secrets live in Settings → Secrets → **Actions**; account ID `d357be58f5550eea081b0c8d80824abf` (Whip Blanket). Token = Cloudflare **Edit Cloudflare Workers** template |
| Owner CLI | `wrangler` logged in as `przemek.fall@gmail.com` / account Whip Blanket. CLI deploy still works as fallback; CI is primary |

If the phone still shows an old footer: clear site data for `megabomb420.github.io`. Footer must read **v0.3.28**.

```bash
curl -s https://megabomb420.github.io/anime-buddy/version.json
curl -s https://anime-buddy-worker.whip-blanket.workers.dev/api/health
```

---

## Shipped (do not re-do unless fixing)

| Ver | What |
| --- | --- |
| 0.3.8 | Chat progress, ratings, after-X, time budget, drop+reason → confirm cards |
| 0.3.9–0.3.10 | Lookup `znajdź` / bare title; Spy×Family `×`/`x` normalize |
| 0.3.11 | PWA AniList facts in chat; Worker tools in **source** |
| 0.3.12 | Batch multi-title confirms; library-read from chat; spoiler level (Profile + prompt); Taste DNA Rebuild → Worker `analyzeTaste` |
| 0.3.13 | Home **For you** row — ratings + library → AniList pool, ranked in `src/lib/taste-rank.ts` |
| 0.3.14 | **For you** polish — reason under each poster, Refresh cycles next-best titles, Interested / Not for me tap feedback via `recordFeedback` (`forYou()` returns `reasons`, takes `excludeIds`) |
| 0.3.15 | **Tonight** no longer Crunchyroll-first (`requireCrunchyroll: false`, same as Ren recs) → picks always render |
| 0.3.18 | Featured hero: **swipe left/right** on touch (48px threshold, vertical scroll untouched), rotation now **10s**, manual pick (dots or swipe) restarts the timer |
| 0.3.19 | Hero dedupe: **Open title** → detail, **Details** replaced by **Ask Ren** → `/buddy` with `location.state.prefill` (BuddyPage consumes it once). Cover **slow zoom-in** synced to the 10s window (`hero-kenburns` now `10s ease-out forwards`) |
| 0.3.20 | Same slow zoom on the **anime detail banner** (`.detail-banner-art`, one-shot 14s, reduced-motion respected) |
| 0.3.21 | **Undo toasts** on every library/rating write (Buddy confirms, detail status/rating/remove, Scan "Plan to watch") — 6s sonner toast restores the exact previous entry/rating/progress via new `persistence` restore helpers |
| 0.3.22 | **Permanent "Not for me"** — DB schema v2 `hiddenAnime` table; `recordFeedback("not_for_me")` hides the title from For you / Tonight / Buddy recs **forever** (excluded in `buildHardConstraints` + `forYou()`), manageable in **Profile → Hidden titles**, undoable from the toast |
| 0.3.23 | **Ren write intents round 2** — `favorite X` / `add X to favorites` / `unfavorite X`, `remove X from my library`, `unrate X`, `note X: …`, `rewatch X` (ep 0 + `rewatchCount++` on the entry). All confirm-first via `actionConfirm` cards, all undoable. Router order: rate → note → favorite → remove → unrate → rewatch → library |
| 0.3.24 | **Buddy chat history** — `Message.payload` stores the rich cards (picks / confirms / compare); reopening a chat restores them. Header **History** button → Sheet with all conversations (auto-titled from the first user message), reopen + delete. New `persistence`: `listConversations` / `renameConversation` / `deleteConversation` |
| 0.3.25 | **Tonight hard time budget** — `src/lib/time-budget.ts` (unit-tested): MOVIE ≈ 100 min, series = episodes × 24 min, unknown episode counts never fit. Wired into Home Tonight chips **and** Ren's time-budget asks (`I have 40 minutes`). Fallback note when nothing fits |
| 0.3.26 | **Next-episode countdown** — batched AniList `nextAiringEpisode` query (`AniListProvider.getAiringSchedule`, always fresh, not cached) → "Next: Ep N · in 2d" chips in Home **Continue Watching** and Library watching rows. `src/lib/airing.ts` label helper (unit-tested) |
| 0.3.27 | **Library upgrade** — in-list filter, sort (Recent / Title / My rating / Progress), poster-grid view toggle; prefs persist in `localStorage` (`anime-buddy:library-prefs`) |
| 0.3.28 | **Scan history** — DB schema v3 `scanRecords` (photo blob + matched title/character stored locally). Intro screen shows **Recent scans** (tap → anime detail, X deletes). Match cards gain **Ask Ren** → Buddy prefill |
| 0.3.16 | **Session recap** — `src/lib/buddy-session.ts`: chats longer than 12 messages send a deterministic `[Earlier in this chat — recap]` (logged / rated / looked-up / rec asks) + last 11 verbatim to the Worker. Token save without Ren forgetting; no Worker change |
| 0.3.17 | **Compare two titles** — `parseCompareQuery` in `catalog-search.ts` + `src/components/anime/CompareCard.tsx`: `compare X and Y` / `porównaj X z Y` / `X vs Y` → side-by-side AniList facts (score, episodes, status, format, season, genres, studio). No DeepSeek |

Worker tools + SSE health went live via CLI (not CI).

---

## Architecture map

| Path | Role |
| --- | --- |
| `src/pages/BuddyPage.tsx` | Ren UI + router |
| `src/pages/HomePage.tsx` | Featured, Trending, **For you**, Tonight, Hidden Gem |
| `src/lib/buddy-library.ts` | Write + library-read parsers, title split |
| `src/lib/catalog-search.ts` | Title normalize (`×`→` x `), lookup, rank |
| `src/lib/buddy-catalog.ts` + `buddy-catalog-ask.ts` | Prefetch AniList facts for CHAT |
| `src/lib/buddy-session.ts` | Recap of older chat turns → Worker never sees > 12 messages (unit-tested) |
| `src/lib/buddy/persona.ts` | Client lock + system prompt |
| `src/lib/undo.ts` | 6s Undo toast helper — every library/rating/progress write |
| `src/lib/time-budget.ts` | Tonight runtime math (episodes × 24 min, movie ≈ 100 min) — unit-tested |
| `src/lib/airing.ts` | Next-episode countdown labels — unit-tested |
| `src/lib/taste-rank.ts` | Deterministic For-you scoring (unit-tested) |
| `src/lib/services/RecommendationService.ts` | Rec pipeline + `forYou()` |
| `src/lib/db/persistence.ts` | **Only** IndexedDB door. It is an **object literal** — commas between methods or `tsc` dies (`TS1005`) |
| `worker/src/index.ts` | Chat SSE, tools, vision, taste, recommend |
| `worker/src/persona.ts` | Server system prompt (must stay aligned with client) |
| `worker/src/catalog-tools.ts` + `anilist.ts` | Worker AniList tools |

Tests (no npm test script):

```bash
node --experimental-strip-types --test src/lib/buddy-library.test.ts src/lib/buddy/persona.test.ts src/lib/buddy-catalog.test.ts src/lib/buddy-intent.test.ts src/lib/taste-rank.test.ts src/lib/catalog-search.test.ts src/lib/buddy-session.test.ts src/lib/time-budget.test.ts src/lib/airing.test.ts
node node_modules/typescript/bin/tsc -b --pretty false
```

Do **not** run `npx tsc` — that can grab the dummy npm `tsc` package.

---

## Deploy

**Pages:** push `main` → `.github/workflows/pages.yml`. Bump `package.json` version when shipping user-facing app changes.

**Worker:** separate. Pages does **not** update it.

```bash
cd worker
npx wrangler deploy
```

After Worker deploy, health must keep `chat:"sse"`, `thinking:true`, `tools:true`.

If you lack Cloudflare credentials: say so. Do not pretend it deployed. CI Worker job will keep failing until repo secrets exist.

---

## Known traps

1. **`persistence.ts` object-literal commas.** Missing `,` after a method → Pages `tsc -b` fails (`TS1005`). Happened on 0.3.12 (`59d05a4`); fixed in `f4fbb28`.
2. **Stale PWA.** Users think nothing shipped. Check Home footer vs `version.json`.
3. **Spy×Family.** `normalizeTitleKey` must turn `×` into ` x `, not `x`.
4. **For you** is empty until the user rates or logs library titles. By design.
5. **Client vs Worker persona.** Spoiler block exists in both. Change both or chat/Worker drift.
6. **Do not put keys in** `VITE_*`, `.env`, or `wrangler.toml` `[vars]`.

---

## What to do next (unless the user overrides)

Suggested order, small PRs:

1. Hardware Scan QA on a real phone (file-upload path was tested; camera was not).
2. AniList username import (public list → confirm → IndexedDB) — biggest onboarding unlock.
3. Profile stats charts with the already-shipped recharts (genre radar, hours/month).
4. Polish write-intent variants for the 0.3.23 actions (favorite/note/remove/rewatch) — currently EN-only.

Rule stays: **LLM talks / plans; AniList is facts; user confirms writes.**

---

## Try (Buddy)

- `episode 12 Naruto` → confirm + progress  
- `rate 9 Attack on Titan` → confirm score  
- `I finished Naruto, Bleach and One Piece` → one confirm per title  
- `what am I watching` / `co oglądam` → library cards  
- `znajdź Spy x Family` / `spy x family` → catalog  
- `compare Naruto and Bleach` / `porównaj Naruto z Bleach` / `Naruto vs Bleach` → side-by-side card  
- `favorite Naruto` / `note Frieren: quiet and warm` / `rewatch Bleach` / `unrate Naruto` → confirm cards  
- `ile odcinków ma One Piece` → AniList facts + cover  
- Home **For you** after rating something  
- Buddy **History** button → reopen an older chat (cards come back)

---

## How you work

- Read this file first.
- Small commits. Push `main` for Pages.
- Worker changes: CLI deploy + health check, or admit you cannot.
- Keep Ren router order.
- Never invent anime metadata; resolve via AniList ids.
- User-facing change → handover + README same window.
- After Pages: confirm `version.json` and Home footer. If mismatch, wait for Actions or clear site data.
