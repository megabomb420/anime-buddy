# Anime Buddy — Handover

**Date:** 2026-08-24  
**App version:** `0.3.13`  
**Live:** https://megabomb420.github.io/anime-buddy/  
**Worker:** https://anime-buddy-worker.whip-blanket.workers.dev

**Docs rule:** user-facing change → update this file + README in the same ship window.

---

## Worker status (priority #1 — live as of 2026-08-24)

| | Source (`main`) | Live Worker |
| --- | --- | --- |
| `/api/health` | `chat: "sse"`, `thinking: true`, `tools: true`, `catalog: "anilist"` | **live** — same shape (verified) |
| AniList tools on chat | `search_anime`, `get_anime`, `browse_catalog`, `search_character` when client sent no facts | **deployed** (`cd worker && npx wrangler deploy`, version `cc04a31f`) |
| GitHub Action `Deploy Worker` | runs on `worker/**` push | **still fails** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` empty |

PWA pre-fetches AniList facts client-side (`buddy-catalog.ts`) and stuffs them into the prompt. Worker tools cover turns with **no** `catalogFacts` / picks.

### Redeploy Worker

**Option A — CLI** (this is how live parity shipped; `wrangler login` already done on the owner machine)

```bash
cd worker
npm ci
npx wrangler deploy
# secrets already on the Worker stay; only re-put if missing:
# npx wrangler secret put DEEPSEEK_API_KEY
```

**Option B — fix CI** (still needed so `main` pushes to `worker/**` deploy themselves)

1. Cloudflare → API Tokens → create token with **Workers Scripts: Edit**  
2. GitHub repo → Settings → Secrets and variables → Actions  
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`  
4. Actions → **Deploy Worker** → Run workflow  

### Verify after deploy

```bash
curl -s https://anime-buddy-worker.whip-blanket.workers.dev/api/health
```

Expect:

```json
{
  "ok": true,
  "service": "anime-buddy-worker",
  "vision": true,
  "tmdb": false,
  "chat": "sse",
  "thinking": true,
  "tools": true,
  "catalog": "anilist"
}
```

(`tmdb: true` only if `TMDB_API_KEY` secret is set.)

---

## DeepSeek LLM — top 10 roadmap (text only, no vision)

| # | Feature | Status |
| --- | --- | --- |
| 1 | **Progress via chat** → confirm → Library | **Shipped 0.3.8** |
| 2 | **Ratings via chat** → confirm → score + taste | **Shipped 0.3.8** |
| 3 | **After X / similar** → catalog similar recs | **Shipped 0.3.8** |
| 4 | **Natural time budget** → tonight-style query | **Shipped 0.3.8** |
| 5 | **Drop + reason** → dropped + free-text taste signal | **Shipped 0.3.8** |
| 6 | Batch multi-title log in one message | **Shipped 0.3.12** |
| 7 | Taste DNA blurb (Worker `analyzeTaste` on Profile rebuild) | **Shipped 0.3.12** |
| 8 | Spoiler level (settings + prompt) | **Shipped 0.3.12** |
| — | Library queries from chat (`what am I watching`) | **Shipped 0.3.12** |
| — | **Home For you** (ratings + library → AniList pool) | **Shipped 0.3.13** |
| 9 | Session summary every N turns (token save) | Later |
| 10 | Compare two catalog titles side by side | Later |
| — | **AniList facts in chat** (PWA pre-fetch) | **Shipped 0.3.11** |
| — | **Worker AniList tools + health fields** | **Live 2026-08-24** (CLI deploy; CI secrets still missing) |

Rule stays: **LLM talks / plans; AniList is facts; user confirms writes.**

### Try (Buddy)

- `episode 12 Naruto` → confirm card with ep progress  
- `rate 9 Attack on Titan` → confirm score  
- `rzuciłem One Piece bo filler` → dropped + reason signal  
- `mam 40 min, coś lekkiego` → short tonight recs  
- `what next after Steins;Gate` → similar cards
- `ile odcinków ma One Piece` → episode count from AniList + cover
- `kto to Lelouch` → character + their anime from AniList
- `what's trending` / `ten sezon` → live list + covers
- `znajdź Spy x Family` / bare `spy x family` → catalog cards (no DeepSeek)
- `I finished Naruto, Bleach and One Piece` → confirm cards per title (no DeepSeek)
- `what am I watching` / `co oglądam` → IndexedDB library cards (no DeepSeek)

Ren does **not** invent catalog facts. The PWA looks titles up (`src/lib/buddy-catalog.ts`) and stuffs compact facts into the prompt. Worker tools cover turns with no client facts.

---

## If “nothing changed” on the phone

1. Home footer must show **`v0.3.13`** (or newer).  
2. Else clear site data for `megabomb420.github.io` (stale PWA SW).  
3. `curl -s https://megabomb420.github.io/anime-buddy/version.json`

---

## Product snapshot

Local-first PWA: Discover, Library, Scan (vision), **Ren** chat. IndexedDB only. AniList catalog. DeepSeek only via Worker.

### Ren router (0.3.11+)

1. **Write** — library / rate / progress (including comma/`and`/`i` lists) → Confirm cards (no DeepSeek)  
2. **Library read** — `what am I watching` / `co oglądam` / `my library` → IndexedDB cards (no DeepSeek)  
3. **Lookup** — `znajdź` / bare title → catalog cards (no DeepSeek)  
4. **Chat + facts** — rec / episodes / cast / trending → PWA facts + DeepSeek stream + spoiler caps  

Persona lock client + Worker. Spam guard client-side.

### Featured

Top 8 trending, 45s rotate, dots to jump.

### For you (Home)

Deterministic rank (`src/lib/taste-rank.ts`): ratings, completed/watching, dropped, favorites → genre weights. Candidate pool is AniList only (per-title recommendations + top genres + trending). Library ids excluded. No DeepSeek, no invented titles. Empty until the user rates or logs something.

### Deploy

- Pages: push `main`  
- Worker: CLI `cd worker && npx wrangler deploy` (live is at parity). CI still needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — Pages alone does not update the Worker.
