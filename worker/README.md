# Anime Buddy Worker

Small Cloudflare Worker that keeps private API keys (DeepSeek, TMDB) off the
client. It is **not** the main backend — all user data stays local in the PWA.

## Dashboard setup (no CLI)

1. Create a DeepSeek API key at [platform.deepseek.com](https://platform.deepseek.com/api_keys).
2. Open [Cloudflare Workers](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
3. **Create** → import GitHub repo `megabomb420/anime-buddy`.
   Set the **root directory** to `worker`.
4. After the first deploy, open the Worker → **Settings** → **Variables and Secrets** → **Add**.
   - Type: **Secret**
   - Name: `DEEPSEEK_API_KEY`
   - Value: your DeepSeek key
5. Optional: add another secret named `TMDB_API_KEY` for regional availability.
6. The public app is already pointed at `https://anime-buddy-worker.whip-blanket.workers.dev`. If you deploy your own Worker, override that address in Anime Buddy → **Profile → Scan + Buddy**.

One-click deploy:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/megabomb420/anime-buddy/tree/main/worker)

After that button, you still add `DEEPSEEK_API_KEY` as a secret (step 4).

Do **not** put the key in the app, in `VITE_` env vars, or in `wrangler.toml`.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness. `{ ok, vision, tmdb }` — `vision` is true only when the secret is set |
| `POST /api/ai/chat` | Buddy conversation. Thinking on (`deepseek-v4-flash`). Streams SSE `{c}` deltas; JSON `{reply}` only for locked/off-lane lines |
| `POST /api/ai/recommend` | Semantic reranking of a 10–30 candidate pool |
| `POST /api/ai/taste` | Taste DNA interpretation |
| `POST /api/ai/signals` | Taste-signal extraction from notes |
| `POST /api/ai/vision` | Anime Lens (DeepSeek V4 Flash). `503` if the secret is missing |
| `GET /api/tmdb/*` | TMDB passthrough with secret API key |

## CLI (optional)

```bash
cd worker
npm install
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```
