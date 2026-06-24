# CULINOVA ERP — Deployment Guide (Vercel)

This repo is **6 separate apps**: one backend (`server`) + five frontends
(`client`, `admin`, `customer`, `suplier`, `Technician`). On Vercel, **each folder
is its own Vercel Project** (one repo → import it 6 times, each with a different
"Root Directory").

---

## 1) Backend — `server`  (deploy FIRST)

Vercel → **New Project** → import this repo →

- **Root Directory:** `Culinova-Custom-ERPNext/server`
- **Framework Preset:** Other
- **Build Command:** (leave empty)
- **Output Directory:** (leave empty)

### Environment Variables (Settings → Environment Variables)
Copy the values from your local `server/.env` (do NOT commit secrets to the repo):

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://bliwbbhfujxsbquinydr.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *(from `server/.env` — the `sb_secret_…` key, keep secret)* |
| `SUPABASE_ANON_KEY` | *(from `server/.env` — the `sb_publishable_…` key)* |
| `JWT_SECRET` | *(from `server/.env` — a long random string)* |
| `JWT_EXPIRES` | `12h` |
| `CORS_ORIGINS` | `*` |

> The crash happens when these are missing. **Add them, then Redeploy.**

Already wired for serverless: `server/api/index.js` (exports the app, no `listen`)
and `server/vercel.json` (routes everything to it).

**Test:** open `https://<your-backend>.vercel.app/api/health` → should return `{"ok":true}`.
Then seed the admin once: POST `https://<your-backend>.vercel.app/api/auth/seed`.

---

## 2) Frontends — `client` / `admin` / `customer` / `suplier` / `Technician`

For **each** app, create a separate Vercel Project →

- **Root Directory:** e.g. `Culinova-Custom-ERPNext/client`
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

### Environment Variable (each frontend)
| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://<your-backend>.vercel.app/api` |

Each app already has a `vercel.json` for SPA routing (so refresh doesn't 404).

Suggested first deploy: **`client`** (staff app) → log in with `admin@gmail.com` / `admin@123!`.

---

## Notes
- Auth uses a **Bearer token** (not cookies), so `CORS_ORIGINS=*` is fine; tighten
  it later to your exact frontend URLs if you prefer.
- Local dev is unchanged: `cd server && npm run dev` (uses `src/server.js`).
- **Simpler backend alternative:** Render.com → New Web Service → root `server`,
  Build `npm install`, Start `npm start`, add the same env vars. Runs the Express
  server as-is (no serverless quirks). Then point each frontend's `VITE_API_URL` to
  the Render URL.
