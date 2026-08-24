# Anime Buddy — Handover (for the next agent)

**Date:** 2026-08-24  
**App version:** `0.3.14` (live)  
**HEAD:** `main` @ 0.3.14 (see `git log -1`)  
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
3. **LOOKUP** — `znajdź` / `find` / bare title → catalog cards. **No DeepSeek.**
4. **CHAT** — rec / facts / free talk → PWA prefetches AniList (`buddy-catalog.ts`) + optional `RecommendationService` → stream DeepSeek with `catalogFacts` / `libraryBrief` / `tasteSummary` / `spoilerLimits`.

Persona lock: client (`src/lib/buddy/persona.ts`) **and** Worker (`worker/src/persona.ts`). Keep them in sync. Spam guard is client-side. User must confirm all library/rating writes.

When debugging “Buddy doesn’t find X”: catalog-search normalization (`×`/`x`), intent router order, then stale PWA/version.

---

## Live status (verified 2026-08-24)

| Surface | State |
| --- | --- |
| Pages | **v0.3.14** — `version.json` must match `package.json` |
| Worker `/api/health` | `{ ok, vision:true, tmdb:false, chat:"sse", thinking:true, tools:true, catalog:"anilist" }` |
| Worker tools | Live (CLI deploy). Persona includes spoiler lock. |
| Worker GitHub Action | **Still fails** — `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` empty |
| Owner CLI | `wrangler` logged in as `przemek.fall@gmail.com` / account Whip Blanket. `cd worker && npx wrangler deploy` works on that machine |

If the phone still shows an old footer: clear site data for `megabomb420.github.io`. Footer must read **v0.3.14**.

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
| `src/lib/buddy/persona.ts` | Client lock + system prompt |
| `src/lib/taste-rank.ts` | Deterministic For-you scoring (unit-tested) |
| `src/lib/services/RecommendationService.ts` | Rec pipeline + `forYou()` |
| `src/lib/db/persistence.ts` | **Only** IndexedDB door. It is an **object literal** — commas between methods or `tsc` dies (`TS1005`) |
| `worker/src/index.ts` | Chat SSE, tools, vision, taste, recommend |
| `worker/src/persona.ts` | Server system prompt (must stay aligned with client) |
| `worker/src/catalog-tools.ts` + `anilist.ts` | Worker AniList tools |

Tests (no npm test script):

```bash
node --experimental-strip-types --test src/lib/buddy-library.test.ts src/lib/buddy/persona.test.ts src/lib/buddy-catalog.test.ts src/lib/buddy-intent.test.ts src/lib/taste-rank.test.ts
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
4. **Tonight recs** still `requireCrunchyroll` default **true** → pool often empty. For-you and Ren recs skip that.
5. **For you** is empty until the user rates or logs library titles. By design.
6. **Client vs Worker persona.** Spoiler block exists in both. Change both or chat/Worker drift.
7. **Do not put keys in** `VITE_*`, `.env`, or `wrangler.toml` `[vars]`.

---

## What to do next (unless the user overrides)

Suggested order, small PRs:

1. **Tonight without Crunchyroll-first** — same as Ren recs, or fallback already in service but Home still waits on empty verified pool.
2. **Session summary every N turns** (roadmap #9) — token save; still no invented catalog facts.
3. **Compare two catalog titles** (roadmap #10) — AniList ids only, side by side cards.
4. **Worker CI secrets** — tell the user to add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; do not invent a deploy.
5. Hardware Scan QA on a real phone (file-upload path was tested; camera was not).

Rule stays: **LLM talks / plans; AniList is facts; user confirms writes.**

---

## Try (Buddy)

- `episode 12 Naruto` → confirm + progress  
- `rate 9 Attack on Titan` → confirm score  
- `I finished Naruto, Bleach and One Piece` → one confirm per title  
- `what am I watching` / `co oglądam` → library cards  
- `znajdź Spy x Family` / `spy x family` → catalog  
- `ile odcinków ma One Piece` → AniList facts + cover  
- Home **For you** after rating something  

---

## How you work

- Read this file first.
- Small commits. Push `main` for Pages.
- Worker changes: CLI deploy + health check, or admit you cannot.
- Keep Ren router order.
- Never invent anime metadata; resolve via AniList ids.
- User-facing change → handover + README same window.
- After Pages: confirm `version.json` and Home footer. If mismatch, wait for Actions or clear site data.
