# Sprint 5 Block 1 — Production env checklist

**Date:** 2026-08-30  
**Note:** Same Supabase project serves local API and production Vercel backends. Migrations applied locally are on “prod DB” already — still **verify**, don’t assume.  
**Secrets:** never paste keys into git. Values marked *(secret)* live only in Vercel → Project → Settings → Environment Variables.

---

## Deployed services

| Service | Vercel project (expected) | Production URL |
|---------|---------------------------|----------------|
| ERP API | `culinova-backend` | https://culinova-backend.vercel.app |
| ERP client | `culinova-client` | https://culinova-client.vercel.app |
| ERP customer portal | `culinova-customer` | https://culinova-customer.vercel.app |
| ERP admin (if used) | `culinova-admin` | https://culinova-admin.vercel.app |
| ERP supplier | `culinova-suplier` | https://culinova-suplier.vercel.app |
| ERP technician | `culinova-technician` | https://culinova-technician.vercel.app |
| EOS API | `culinova-rag-knowledgebase-server` | https://culinova-rag-knowledgebase-server.vercel.app |
| EOS admin | `culinova-rag-knowledgebase-admin` | https://culinova-rag-knowledgebase-admin.vercel.app |

---

## ERP backend (`culinova-backend`)

| Variable | Local today | Production value needed | Status |
|----------|-------------|-------------------------|--------|
| `SUPABASE_URL` | project URL | **same** Supabase URL | confirm on Vercel |
| `SUPABASE_SERVICE_KEY` | *(secret)* | **same** service role | confirm |
| `SUPABASE_ANON_KEY` | *(secret)* | same anon (if used) | confirm |
| `JWT_SECRET` | *(secret)* | **same** as local (sessions) | confirm |
| `JWT_EXPIRES` | `8h` | `8h` | optional |
| `CORS_ORIGINS` | local + vercel fronts | all `*.vercel.app` fronts listed in `.env.example` | confirm |
| `EOS_API_URL` | `http://localhost:4400` ⚠️ LOCAL | `https://culinova-rag-knowledgebase-server.vercel.app` (or unset — code defaults prod on Vercel) | **MUST NOT be localhost on Vercel** |
| `ERP_EOS_INTEGRATION_KEY` | *(secret)* | **must match** EOS `ERP_INTEGRATION_KEY` | confirm |
| `ERP_INTEGRATION_KEY` | same as above | same | confirm |
| `CUSTOMER_PORTAL_URL` | `http://localhost:5175` (local OK) | `https://culinova-customer.vercel.app` — **code ignores localhost on Vercel** (S5B1 fix) | set prod URL; safe if stale localhost |
| `SMTP_HOST` | `smtp.gmail.com` | `smtp.gmail.com` | set for demo |
| `SMTP_PORT` | `587` | `587` | set |
| `SMTP_USER` | Gmail address | same demo Gmail | user pastes on Vercel |
| `SMTP_PASS` | Gmail app password *(secret)* | same | user pastes on Vercel |
| `SMTP_FROM` | `"CULINOVA <…>"` | same | set |
| `OPENAI_API_KEY` | *(secret)* | same if AI Insights used | confirm |
| `OPENAI_INSIGHTS_MODEL` | `gpt-4o-mini` | same | optional |
| `DATABASE_URL` | pooler URL | **not needed on Vercel runtime** (migrate from laptop only) | local/CI only |
| `PORT` | `5050` | ignored on Vercel | n/a |

---

## ERP frontends (`VITE_*` baked at build time)

| Service | Variable | Local | Production (`.env.production`) |
|---------|----------|-------|--------------------------------|
| client | `VITE_API_URL` | `http://localhost:5050/api` | `https://culinova-backend.vercel.app/api` ✅ in repo |
| customer | `VITE_API_URL` | localhost | `https://culinova-backend.vercel.app/api` ✅ |
| admin / supplier / technician | `VITE_API_URL` | localhost | prod backend `/api` — confirm each `.env.production` |

---

## EOS backend (`culinova-rag-knowledgebase-server`)

| Variable | Local | Production needed | Status |
|----------|-------|-------------------|--------|
| `JWT_SECRET` | *(secret)* | required — already set historically | confirm |
| `SUPABASE_URL` | EOS project URL | same | confirm |
| `SUPABASE_SERVICE_ROLE_KEY` | *(secret)* | same | confirm |
| `DATABASE_URL` | pooler | migrate-from-laptop only | n/a runtime |
| `OPENAI_API_KEY` | *(secret)* | same | confirm |
| `OPENAI_EXTRACTION_MODEL` / embedding | set | same | confirm |
| `CHROMA_URL` | localhost optional | **unset on Vercel** (text search fallback) | confirm unset |
| `CORS_ORIGINS` | local admin/client | prod EOS admin (+ ERP if needed) | confirm |
| `CORS_ALLOW_VERCEL` | false | `true` only if preview origins needed | prefer explicit origins |
| `ERP_INTEGRATION_KEY` | *(secret)* | **must match** ERP key | confirm |
| `ERP_API_URL` | may be localhost ⚠️ | `https://culinova-backend.vercel.app` (or unset — code defaults prod) | **MUST NOT be localhost** |

---

## EOS admin frontend

| Variable | Production |
|----------|------------|
| `VITE_API_BASE` / `VITE_API_URL` | `https://culinova-rag-knowledgebase-server.vercel.app` ✅ in `.env.production` |
| `VITE_TRUSTED_STORAGE_HOSTS` | EOS Supabase host | confirm |

---

## SMTP / cron notes

- **SMTP:** Gmail app-password is OK for Muhammad demo; client corporate SMTP later. Without SMTP, send still marks Sent + portal notify but skips email.
- **Cron / EOS sync timer:** ERP auto-import cadence is in-app settings (not a Vercel cron). Webhook path is request-time (EOS approve → ERP). No separate cron env required for S5B1 proof.
- **Integration keys:** names on Vercel must be exactly `ERP_EOS_INTEGRATION_KEY` / `ERP_INTEGRATION_KEY` (ERP) and `ERP_INTEGRATION_KEY` (EOS).

---

## Vercel deploy blocker (author email)

Commits are authored as **`hmza56jb@gmail.com`**. Vercel team owner is **`waqas56jb`**. Deployments from non-member git authors are blocked.

### Fix option A (preferred) — invite member (~2 min)
1. Vercel → Team → Settings → Members  
2. Invite **`hmza56jb@gmail.com`** as Member  
3. Accept invite → Redeploy latest `main`

### Fix option B — git email switch + empty commit
1. On the machine that pushes: `git config user.email "waqas56jb@gmail.com"` (only if that identity is allowed)  
2. Empty commit on `main` + push so Vercel sees an allowed author  
3. Redeploy

**User clicks:** invite / email fix → Deploy on each stale project (ERP backend, ERP client, customer, EOS server, EOS admin at minimum).

---

## Pre-flight snapshot (Cursor, 2026-08-30)

| Check | Result |
|-------|--------|
| ERP git | S4B3 committed as `1a8c2ec` — **ahead of origin by 1** (needs push) |
| EOS git | clean, synced `94e601c` |
| `npm run build` ERP client | ✅ |
| `npm run build` customer | ✅ |
| `npm run build` EOS admin | ✅ |
| Claimed seal commit `4c1f9a2` | **not on this machine** — local seal is `1a8c2ec` |
