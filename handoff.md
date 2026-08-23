# Anime Buddy — Handoff

## Project

Anime Buddy is a local-first, mobile-first PWA for discovering and tracking anime **and** recognizing figurines/characters from the camera.

It is not only a catalog/library app. Signature features:

- anime discovery
- personal library
- Buddy recommendations
- **camera-based visual recognition** of figurines, merch, and character art
- linking physical collectibles back to real catalog titles

**Canonical metadata**: AniList GraphQL. Secondary: Jikan (MAL score/rating) and TMDB (regional availability/certifications, via Worker). AI never invents titles, scores, age ratings, or Crunchyroll facts.

**Stack (this build)**: React 19 + TypeScript + TanStack Start/Router + Tailwind v4 + shadcn/ui + Dexie (IndexedDB). Vision goes through a **server-only gateway** (`analyzeVisionFn`) or the Cloudflare Worker — never the browser.

Auth/database (Neon) stay **off**. All personal data is local IndexedDB.

---

## Scan / camera architecture

```
User opens Scan
  → getUserMedia (rear camera preferred)  OR  file picker fallback
  → JPEG capture
  → client compress (max 1280px, quality 0.82, EXIF via createImageBitmap)
  → POST to vision gateway (server fn, or Worker if VITE_WORKER_URL is set)
       model: deepseek-v4-flash-vision-exp
  → structured VisualRecognitionResult JSON
  → AniList search / character search (catalog is canonical)
  → result sheet: confidence band + catalog matches + Open / Plan to watch
```

### Image handling

- `src/lib/image/compress.ts` — resize longest edge to 1280, JPEG 0.82
- Captures are **not** persisted. Object URLs are revoked on retake/unmount
- Orientation comes from the live video frame (camera) or `createImageBitmap` (files)

### Gateway

| Path | When |
|---|---|
| TanStack `analyzeVisionFn` (`src/lib/server/analyze-vision.ts`) | Default. Reads `DEEPSEEK_API_KEY` **server-side only** |
| Cloudflare Worker `POST /api/ai/vision` | When `VITE_WORKER_URL` is set. Same model, same JSON shape |

The client never sees the API key. Keys must not be `VITE_`-prefixed and must not be committed.

If the key is missing, Scan still opens the camera and accepts photos. Identification returns `not_configured` with a recovery path (retake / file / catalog search). **xAI is not used as a fallback.**

### Structured recognition

```ts
type VisualRecognitionResult = {
  detected: boolean;
  objectType?: "figurine" | "character_art" | "merchandise" | "manga" | "unknown";
  characterName?: string;
  franchiseTitle?: string;
  animeTitle?: string;
  confidence?: number; // 0..1
  alternatives?: Array<{ characterName?: string; animeTitle?: string; confidence?: number }>;
  reasoningSummary?: string;
};
```

AI identifies. AniList provides canonical ids, covers, scores, and metadata. Model names are **search queries only**.

### Confidence bands

| Band | UI |
|---|---|
| high | "Looks like a match" — featured catalog card |
| likely | "Likely match" — confirm / pick another |
| ambiguous | "A few possibilities" — user chooses |
| none | unable to identify, or catalog miss |

Never pretends a low-confidence guess is fact.

### Camera UX states

intro → requesting → live → analyzing → results  
denied / unavailable / offline / timeout / provider_error / not_configured / invalid_response

Live viewfinder: rear camera, switch facing, scan frame, capture shutter, photo library. Front camera is mirrored for preview only; the captured bitmap is unflipped. Safe-area padding on chrome. Scan hides the bottom nav.

File input (`accept="image/*"`, no `capture` attribute) is the camera-less QA path.

---

## Routing

| Path | Screen |
|---|---|
| `/` | Home |
| `/discover` | Discover (`?q=` pre-fills search) |
| `/scan` | Camera / figurine recognition |
| `/library` | Library |
| `/buddy` | Buddy chat |
| `/profile` | Profile |
| `/anime/:anilistId` | Anime detail |
| `/characters` | Character search |
| `/character/:characterId` | Character detail |

Mobile bottom nav: Home / Discover / **Scan (center FAB)** / Library / Buddy. Profile is on desktop rail + Home/Discover links.

---

## Data flow

1. UI talks to `services/*` and `persistence` — not Dexie, not providers
2. Catalog cache + personal data live in IndexedDB (`src/lib/local-db/`)
3. Vision gateway is the only place `DEEPSEEK_API_KEY` is read

---

## Environment

App (never commit secrets):

```
VITE_WORKER_URL=          # optional Cloudflare Worker
VITE_AI_PROVIDER=mock     # mock | deepseek  (chat/recommend only)
```

Server / Worker secrets:

```
DEEPSEEK_API_KEY          # required for Scan identification
TMDB_API_KEY              # Worker only, availability/certs
```

---

## Limitations

- This environment has **no `DEEPSEEK_API_KEY`**, so live identification returns `not_configured`. Camera, capture, compress, file fallback, result chrome, and catalog resolution code are in place.
- Hardware camera was **not** exercised on a physical phone. File-upload path was used for QA.
- Recommendations do **not** require verified Crunchyroll (the pool would be empty without TMDB). Availability is still labeled honestly when known.
- Buddy chat defaults to MockAIProvider unless `VITE_AI_PROVIDER=deepseek` **and** a Worker URL is set.

---

## What was tested

- Typecheck (`tsc --noEmit`) — pass
- Production build — pass
- Dev + production preview: Home, Discover, Scan intro, Library, Buddy, Profile, Characters, anime detail
- Desktop (1280×800) and mobile (390×844) smoke: visible catalog content, no console errors, no brand warnings
- Scan file-picker path: compress → gateway. Without `DEEPSEEK_API_KEY` the result is **Vision isn't configured** (honest, with Try again / Search catalog)
- Camera permission/unavailable: sandbox has no hardware camera; UI shows **No camera** + photo fallback. Not claimed as device-camera verification.
- Library: Plan to watch from anime detail persists; All tab shows the title
- Deep link `/anime/:id` loads AniList metadata (scores labeled AniList/MAL, no fabricated ratings)

## GitHub

Pushed to `main` (no force-push):

- Repo: https://github.com/megabomb420/anime-buddy
- Commit: `fc023291fa4e92fd6a016d629b74c774a9ae5ee8`
- Message: Add Scan: camera figurine recognition via DeepSeek V4 Flash

The GitHub repo remains the Vite + React Router PWA. Scan there uses the Cloudflare Worker (`POST /api/ai/vision`). This preview is a TanStack Start port of the same product; vision uses `analyzeVisionFn` when no Worker URL is set. Same model. Same catalog-resolution rule.
