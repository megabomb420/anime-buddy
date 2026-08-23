# Anime Buddy — Handoff

## Project

Anime Buddy is a local-first PWA for discovering and tracking anime. It uses AniList as the canonical metadata source, with secondary data from Jikan (MAL) and TMDB (regional availability/certifications). AI features go through a Cloudflare Worker to a DeepSeek model.

**Stack**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Dexie (IndexedDB) + vite-plugin-pwa + Cloudflare Worker.

**Build setup**:
- PWA: `npm run build` (tsc + vite build)
- Worker: `cd worker && npm run typecheck` (tsc --noEmit)
- Dev: `npm run dev` (port 3000)

---

## Current state

### Implemented and working

- **5-tab app shell** with bottom navigation (Home / Discover / Buddy / Library / Profile)
- **Anime Detail screen** (`/anime/:anilistId`):
  - Banner, cover, titles, synopsis with spoiler shield (Strict/Normal/Off)
  - Genres, tags, studios, season/year, episodes, status
  - AniList score, MAL score (lazy-fetched), user rating (1–10, half points)
  - Age guide with source labeling (TMDB → MAL → AniList guard)
  - Crunchyroll availability state (verified/candidate/unverified/unavailable)
  - Characters grid with navigation to character detail
  - Related anime carousel
  - Library status buttons (Watching/Completed/Want to Watch/On Hold/Dropped)
  - Progress +/- controls
  - Quick reactions (Loved it/Good/Mixed/Meh/Hated it/Dropped)
  - Numeric rating slider
  - Notes (add/delete)
- **Home page**:
  - Tonight Mode (30min / 1hr / 90min / 2hr / 3hr / All night)
  - Hidden Gem recommendations
  - Surprise Me recommendations
  - Continue Watching section
  - Quick stats cards
  - Onboarding card
- **Discover page**:
  - Search with AniList GraphQL
  - Trending, Seasonal, Popular tabs
  - Genre/format/score filters
  - Anime cards navigate to detail
- **Library page**:
  - All / Watching / Want to Watch / Completed / On Hold / Dropped tabs
  - Real titles and covers from cache
  - Progress controls per item
  - Favorites section
- **Characters page** (`/characters`):
  - Search characters via anime
  - Favorites toggle
  - Rating display
  - Grid layout
- **Character Detail** (`/character/:characterId`):
  - Image, name, native name
  - Favorite toggle
  - Rating slider
  - Notes
- **Buddy chat**:
  - Persistent conversations
  - MockAIProvider by default (deterministic offline)
  - DeepSeek via Worker when configured
- **Profile page**:
  - Stats grid (completed, episodes, hours, avg rating, favorites, completion rate)
  - Taste DNA display + genre-weight badges
  - Rating distribution bar chart
  - Content visibility settings (Show all / Hide 18+ / Family)
  - Family mode max-age input
  - Data export (JSON download)
  - Data import (file picker + reload)
  - Quick links to Library/Characters
- **PWA**: manifest, service worker, dark theme, placeholder SVG icon
- **IndexedDB persistence**: all personal data (library, ratings, favorites, notes, taste signals, recommendations, conversations, etc.)

### Architecture

```
src/
  main.tsx          → React root, BrowserRouter, registerSW
  App.tsx           → 5 routes + detail routes, BottomNav
  pages/            → Home, Discover, Buddy, Library, Profile, AnimeDetail, Characters, CharacterDetail
  components/       → AgeBadge, BottomNav, ui/ (40+ shadcn components)
  types/            → entities.ts, anime.ts, age.ts, ai.ts
  lib/
    db/
      database.ts   → Dexie schema v1 (23 tables)
      persistence.ts→ ONLY DB access point for components/services
    providers/
      index.ts      → wiring: ai, catalog, malExtras, tmdb
      catalog/AniListProvider.ts  → GraphQL search/get/trending/popular/seasonal/characters
      catalog/JikanProvider.ts    → MAL score + rating
      catalog/TMDBProvider.ts     → Worker passthrough for providers + certifications
      ai/MockAIProvider.ts        → offline deterministic default
      ai/DeepSeekAIProvider.ts    → Worker passthrough
    services/
      AnimeCatalogService.ts      → search/get + caching + age/availability resolution
      RecommendationService.ts    → deterministic pipeline + optional AI rerank
      TasteService.ts             → learn from ratings/notes, rebuild profile
      MemoryService.ts            → conversations + semantic memory
    age/normalize.ts              → age-guide resolution hierarchy
    availability/resolve.ts       → Crunchyroll state machine
    config.ts                     → Vite env-driven runtime config
```

### Data flow

1. UI calls `services/*` (never providers or Dexie directly)
2. Services call `providers` (abstracted via `lib/providers/index.ts`)
3. Catalog data is cached in IndexedDB (`animeCache`, `characters` tables)
4. Personal data is always stored in IndexedDB (local-first)

### Routing

| Path | Screen |
|---|---|
| `/` | Home |
| `/discover` | Discover |
| `/buddy` | Buddy chat |
| `/library` | Library |
| `/profile` | Profile |
| `/anime/:anilistId` | Anime Detail |
| `/characters` | Characters |
| `/character/:characterId` | Character Detail |

---

## APIs / data sources

| Source | Purpose | Key files | Auth |
|---|---|---|---|
| **AniList GraphQL** | Primary metadata, search, trending, seasonal, popular, characters | `src/lib/providers/catalog/AniListProvider.ts` | None (public) |
| **Jikan v4** | MAL score + content rating | `src/lib/providers/catalog/JikanProvider.ts` | None (public, ~3 req/s) |
| **TMDB** | Regional watch providers + content certifications | Via Worker: `worker/src/index.ts` `/api/tmdb/*` | `TMDB_API_KEY` in Worker secrets |
| **DeepSeek** | Chat, recommendations, taste analysis, image recognition | Via Worker: `worker/src/index.ts` `/api/ai/*` | `DEEPSEEK_API_KEY` in Worker secrets |

### Environment variables

Copy `.env.example` → `.env.local`:
- `VITE_WORKER_URL` — Cloudflare Worker base URL
- `VITE_AI_PROVIDER` — `"mock"` (default) or `"deepseek"`

Worker secrets (via `npx wrangler secret put`):
- `DEEPSEEK_API_KEY`
- `TMDB_API_KEY`

---

## Library / data model

Important states (all in IndexedDB):

| Entity | Table | Key |
|---|---|---|
| LibraryEntry | `libraryEntries` | `anilistId` |
| AnimeRating | `animeRatings` | `anilistId` (1.0–10.0, half points) |
| FavoriteAnime | `favoriteAnime` | `anilistId` |
| ViewingProgress | `viewingProgress` | `anilistId` |
| UserNote | `userNotes` | `id` (auto) |
| TasteSignal | `tasteSignals` | `id` (auto) |
| TasteProfile | `tasteProfiles` | `"main"` |
| CharacterDNA | `characterDNA` | `"main"` |
| RecommendationRecord | `recommendations` | `id` (auto) |
| RecommendationFeedback | `recommendationFeedback` | `id` (auto) |
| Conversation / Message | `conversations` / `messages` | `id` (auto) |
| Settings | `settings` | `"main"` |

---

## Known issues / limitations

- **No live UI smoke test this pass**: build + tsc pass; dev server boots; routes were not individually curl-tested.
- **Bundle size**: main chunk ~550 kB (172 kB gzip). Acceptable for now; add route-level code splitting later.
- **TMDB↔AniList matching**: heuristic by title+year. Store confirmed mappings in `externalIdMappings`.
- **Jikan rate limits**: ~3 req/s; MAL extras cached 7 days.
- **DeepSeek multimodal**: Worker `/api/ai/vision` returns 501 stub; frontend contract is final.
- **PWA icon**: placeholder SVG only; replace before shipping.
- **Anime Lens**: not implemented (vision endpoint is a 501 stub).
- **Tonight Mode**: uses recommendation pipeline but does not yet filter by exact episode runtime vs. time budget.
- **No tests**: none yet.

---

## Recommended next step

The architecture and data integrations are solid. The next stage should be a **product/UI/UX polish pass** by another agent:

- Polish anime detail layout (better typography, spacing, loading states)
- Add skeleton loaders across all lists
- Improve empty states and error handling
- Add pull-to-refresh or swipe gestures
- Fine-tune mobile layouts at 320/375/390/430 px
- Add route-level code splitting
- Replace PWA placeholder icon with real artwork
- Add tests (Vitest + React Testing Library)

Preserve the working architecture, provider contracts, and IndexedDB schema.

---

## Useful commands

```bash
# Install (PWA)
npm install

# Dev server
npm run dev

# Typecheck + build
npm run build

# Preview production build
npm run preview

# Worker (cd worker)
cd worker
npm install
npm run typecheck   # tsc --noEmit
npm run dev         # wrangler dev (needs wrangler.toml + secrets)
npm run deploy
```

**Environment note (this machine)**: Node lives in the Kimi Desktop runtime (`npm.cmd` only, no `npm` shell shim). Use `npm.cmd` or full path. Do NOT use broad process kills to stop the dev server.
