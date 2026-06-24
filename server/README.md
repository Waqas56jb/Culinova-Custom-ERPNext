# CULINOVA Custom ERP — Backend (Node.js + Express + Supabase)

Modular, scalable REST API powering all panels & portals.

## Architecture
```
server/
├── db/schema.sql            # full PostgreSQL schema (run in Supabase)
└── src/
    ├── config/              # env + supabase client
    ├── rbac/permissions.js  # roles → panels, access levels → actions
    ├── middleware/          # auth (JWT), rbac (authorize + redact), error
    ├── core/                # resources config + generic CRUD factory + audit
    ├── modules/
    │   ├── auth/            # login / seed / me
    │   └── sales/           # quotation BUSINESS RULES (GP, discount, approval)
    ├── routes/index.js      # mounts everything
    ├── app.js / server.js
```

## Setup (one-time)
1. **Create a Supabase project** → https://supabase.com (free).
2. Open **SQL Editor** → paste & run `db/schema.sql`.
3. In **Project Settings → API**, copy: Project URL, `service_role` key, `anon` key.
4. `cp .env.example .env` and fill `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`.
5. Install & run:
   ```bash
   npm install
   npm run dev      # http://localhost:5050
   ```
6. Seed the first admin: `POST http://localhost:5050/api/auth/seed`
   → returns `admin@culinova.sa` / `admin123` (change it).

## Key endpoints
| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/auth/login` | → JWT token |
| GET  | `/api/my-access` | panels the role can see (drives frontend hiding) |
| GET/POST | `/api/sales/quotations` | enforces GP / discount / approval rules |
| POST | `/api/sales/quotations/:id/approve` | Approval level only |
| POST | `/api/sales/quotations/:id/accept` | auto-creates Sales Order |
| GET/POST/PATCH/DELETE | `/api/<resource>` | generic CRUD for every panel |

`<resource>` = customers, leads, opportunities, projects, project-boq, suppliers, rfqs,
purchase-orders, items, warehouses, stock, invoices, payments, snags, service-tickets,
employees, payroll, users, audit-log … (see `src/core/resources.js`).

## Security model (RBAC)
- Every request needs `Authorization: Bearer <token>`.
- **Panel guard:** role must include the resource's panel (`src/rbac/permissions.js`).
- **Action guard:** access level (View/Create/Edit/Approval/Full Admin) gates read/create/update/delete/approve.
- **Field redaction:** `cost`, `gp_percent` stripped from responses for non-Management (Sales rules #4/#20).
- **Audit log:** every create/update/approve/send/delete recorded; quotation revisions never deleted.

## Sales & Quotation rules implemented
Mandatory fields (#16) · validity 15/30/60 (#9) · discount max 25% / >20% CEO approval (#6) ·
GP target 45% / min 35% / below needs approval (#5/#11) · discount-source tracking (#7) ·
auto Sales Order on accept (#17) · full audit trail (#18) · cost/GP hidden from sales (#4/#20).

## Next (as CEO sends rules per panel)
Each panel's rules layer into its module (`src/modules/<panel>/`) the same way Sales did.
ZATCA e-invoicing (legal, KSA) will be implemented in the Finance module with the official API.
