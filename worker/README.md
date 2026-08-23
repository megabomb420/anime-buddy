# Anime Buddy Worker

Small, application-specific Cloudflare Worker that keeps private API keys
(DeepSeek, TMDB) off the client. It is **not** the main backend — all user
data stays local in the PWA's IndexedDB.

## Setup

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml   # fill in ALLOWED_ORIGINS
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put TMDB_API_KEY
```

## Run / deploy

```bash
npm run dev        # local dev on http://localhost:8787
npm run typecheck  # TS check
npm run deploy     # deploy to Cloudflare
```

After deploying, point the PWA at it:

```
# .env.local in the repo root
VITE_WORKER_URL=https://anime-buddy-worker.<your-subdomain>.workers.dev
VITE_AI_PROVIDER=deepseek
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check |
| `POST /api/ai/chat` | Buddy conversation (DeepSeek) |
| `POST /api/ai/recommend` | Semantic reranking of a 10–30 candidate pool |
| `POST /api/ai/taste` | Taste DNA interpretation |
| `POST /api/ai/signals` | Taste-signal extraction from notes |
| `POST /api/ai/vision` | DeepSeek V4 Flash multimodal (`deepseek-v4-flash-vision-exp`). Returns structured recognition JSON + candidates. 503 if `DEEPSEEK_API_KEY` is missing. |
| `GET /api/tmdb/*` | TMDB passthrough with secret API key |
