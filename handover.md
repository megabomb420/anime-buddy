# Anime Buddy — Handover

**Date:** 2026-08-24  
**App version:** `0.3.8`  
**Live:** https://megabomb420.github.io/anime-buddy/  
**Worker:** https://anime-buddy-worker.whip-blanket.workers.dev

**Docs rule:** user-facing change → update this file + README in the same ship window.

---

## DeepSeek LLM — top 10 roadmap (text only, no vision)

| # | Feature | Status |
| --- | --- | --- |
| 1 | **Progress via chat** (`episode 12 Naruto` / `jestem na 12 odcinku …`) → confirm → Library | **Shipped 0.3.8** |
| 2 | **Ratings via chat** (`rate 9 AOT` / `daję 8.5 Naruto`) → confirm → score + taste | **Shipped 0.3.8** |
| 3 | **After X / similar** (`what next after …` / `po …`) → catalog similar recs | **Shipped 0.3.8** |
| 4 | **Natural time budget** (`mam 40 min`) → tonight-style query | **Shipped 0.3.8** |
| 5 | **Drop + reason** (`rzuciłem X bo filler`) → dropped + free-text taste signal | **Shipped 0.3.8** |
| 6 | Batch multi-title log in one message | Next |
| 7 | Taste DNA blurb (Worker `analyzeTaste` on Profile rebuild) | Next |
| 8 | Spoiler level (settings + prompt) | Next |
| 9 | Session summary every N turns (token save) | Later |
| 10 | Compare two catalog titles side by side | Later |

Rule stays: **LLM talks / plans; AniList is facts; user confirms writes.**

### Try (Buddy)

- `episode 12 Naruto` → confirm card with ep progress  
- `rate 9 Attack on Titan` → confirm score  
- `rzuciłem One Piece bo filler` → dropped + reason signal  
- `mam 40 min, coś lekkiego` → short tonight recs  
- `what next after Steins;Gate` → similar cards  

---

## If “nothing changed” on the phone

1. Home footer must show **`v0.3.8`** (or newer).  
2. Else clear site data for `megabomb420.github.io` (stale PWA SW).  
3. `curl -s https://megabomb420.github.io/anime-buddy/version.json`

---

## Product snapshot

Local-first PWA: Discover, Library, Scan (vision), **Ren** chat. IndexedDB only. AniList catalog. DeepSeek only via Worker.

### Ren

Anime lane; client + Worker persona lock; library/rating writes only after confirm; spam guard client-side.

### Featured

Top 8 trending, 45s rotate, dots to jump.

### Deploy

- Pages: push `main`  
- Worker: `cd worker && npx wrangler deploy` (secrets on Cloudflare)
