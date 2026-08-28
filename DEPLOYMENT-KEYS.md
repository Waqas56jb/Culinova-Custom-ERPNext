# Deployment keys — ERP ↔ EOS integration

## One secret, two projects

Generate **one** strong random secret (e.g. `openssl rand -base64 48`) and set the **same value** on both Vercel projects, then **redeploy both**.

| Env var | Vercel project | Purpose |
|--------|----------------|---------|
| `ERP_EOS_INTEGRATION_KEY` | **ERP server** (`culinova-backend`) | Validates inbound EOS engineering sync |
| `ERP_INTEGRATION_KEY` | *(fallback on ERP)* | Same value as above |
| `ERP_INTEGRATION_KEY` | **EOS server** (`culinova-rag-knowledgebase-server`) | EOS → ERP push (outbound) |
| `ERP_EOS_INTEGRATION_KEY` | *(fallback on EOS)* | Same value as above |
| `EOS_API_URL` | **ERP server** (optional) | EOS API base; defaults on Vercel |
| `ERP_API_URL` | **EOS server** (optional) | ERP API base; defaults on Vercel |
| `DATABASE_URL` | **ERP server** (migrations only) | `npm run migrate` — not required for runtime API |

## Error messages when misconfigured

| Symptom / message | Missing or wrong | Where |
|-------------------|------------------|--------|
| `ERP integration key not configured on server` | `ERP_EOS_INTEGRATION_KEY` **not set on ERP** | ERP `POST /api/integrations/eos/engineering-requests/sync` → HTTP 503 |
| `Invalid integration key` | Key mismatch or wrong `X-ERP-Integration-Key` header | ERP (401) or EOS inbound (401) |
| `Saved on EOS but ERP sync failed: ERP_INTEGRATION_KEY not configured on EOS server (...)` | Key **not set on EOS** | EOS engineering UI via `_erp_sync.reason` |
| `ERP_API_URL not configured` | EOS cannot resolve ERP URL | EOS outbound sync |

## Diagnostics (after deploy)

| Endpoint | Auth | Project |
|----------|------|---------|
| `GET /api/integrations/eos/status` | ERP Management / System Admin JWT | ERP |
| `GET /api/integrations/erp/status` | EOS Super Admin / Management JWT | EOS |

Returns `integration_key_set`, `eos_api_url` / `erp_api_url`, and (ERP) `can_reach_eos`.

## Local verification

```bash
cd server
npm run migrate          # applies migrations_v5_sprint0.sql (needs DATABASE_URL)
npm run verify:sprint0   # schema + integration status checks
```

## Local dev — sync keys

```bash
node scripts/ensure_integration_key.mjs
```

Restart both servers after changing env vars.
