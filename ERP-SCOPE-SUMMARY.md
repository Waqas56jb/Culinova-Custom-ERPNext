# CULINOVA ERP — Agreed Scope Summary
*Prepared for: Mr. Mohammed B. Amr (CEO) · For long-term roadmap planning*

---

## 1. What We Are Building
A **fully custom ERP** for Culinova (commercial kitchen equipment — supply, fabrication & installation, KSA).
It replaces scattered Excel / WhatsApp / off-the-shelf tools with **one connected system**:

- **Frontend:** custom web apps (React / Vite)
- **Backend:** Node.js + Express (all business rules & automation)
- **Database:** Supabase (PostgreSQL) — one secure central database
- **Hosting:** Cloud (Vercel) — accessible from anywhere
- **Compliance:** ZATCA e-invoicing + 15% VAT to be built into the custom system (KSA legal requirement)

**Guiding principles agreed:** one source of truth · automation over manual work · role-based security · cost/profit protected · management gets live visibility.

---

## 2. The Applications (role-based — each user sees only their area)
| App | Users | Purpose |
|-----|-------|---------|
| **Staff ERP** | Internal staff | Sales, Projects, Procurement, Warehouse, Finance, Site, Service, HR |
| **Admin Console** | Management | Users, roles, permissions, announcements |
| **Customer Portal** | Customers | Quotations, projects, deliveries, invoices, chat with sales |
| **Supplier Portal** | Suppliers | RFQs, purchase orders, deliveries |
| **Technician App** | Field techs (mobile) | Assigned tasks, installations, snags |

---

## 3. Agreed Scope — 5 Milestones

### Milestone 1 — System Audit, Security & Governance
- Role-based access control (each role sees only its panels).
- Sales cannot change selling prices without authorization.
- **Per-role discount limits** → above limit needs manager/CEO approval; hard cap enforced.
- **Cost & profit hidden from Sales / Engineering** (only Management/Finance see money).
- Approved documents protected from silent changes.
- **Full audit trail** of all key changes (quotations, orders, POs, pricing, stock).

### Milestone 2 — Item Master & Inventory
- **Central Item Master** (single product library): Category / Sub-Category / **Product Family**, Brands (with currency + exchange & price factors), **auto Item Code + Name**, **auto pricing** (Supplier Price → Landed Cost → Selling Price → GP%), separate Price Lists, duplicate prevention, one resized image, datasheets, pricing history.
- **CSV / Excel Import + Export + downloadable Template** (bulk-load real data safely, row-by-row validation).
- **Inventory visibility:** Physical / Reserved / Available / Incoming / Aging.
- **Auto stock reservation** on approved order + **release requires Operations approval**.
- Stock availability shown inside quotations & BOQ preparation.

### Milestone 3 — Finance, Costing & Cash Flow
- **Landed cost allocation:** freight, customs, SABER, clearance, storage, internal transport, certificate of origin, bank charges.
- Exchange-rate variance tracking · true product costing.
- Project **estimated cost** & **actual cost**.
- **VAT:** customer & supplier advance-invoice management + reconciliation (prevent double VAT).
- **Cash-flow forecast:** customer collections, supplier payments, project obligations, salaries, rent, recurring expenses — 30 / 60 / 90-day view.

### Milestone 4 — Sales, Procurement, Projects & Delivery
- **CRM:** Leads → Opportunities → Quotations → Orders, pipeline, customer chat, pricing & discount history, quotation statuses (Sent / Negotiation / Rejected), alternative quotations.
- **Sales Order:** dual discount (% + fixed amount), lead-time & area/position transfer, **item-level tracking** (Procurement · Inventory · Delivery · Installation per item), stock availability.
- **Procurement:** suppliers, RFQs, purchase orders, supplier-code mapping, supplier performance.
- **Projects:** automatic handover (order → project), task assignment to real team, budget & cost, installation tracking (0/N → delivered).
- **Delivery:** area & position, customer signature, **acceptance / rejection / return** workflow, pre-delivery readiness report & payment claim, completion % (operational / financial / delivered value / collection).

### Milestone 5 — Dashboards, KPI & Management Reporting
- **Dashboards:** Executive, Financial, Sales, Procurement, Inventory, Project, Cash-Flow, Delayed-Projects.
- **Customer 360** (quotations, orders, project value, conversion, discount history, outstanding).
- **Supplier 360** (purchases, history, discounts, lead-time, outstanding).
- **HR & Employee Portal:** leave workflow, salary-slip distribution, **employee advances** (request/approve/repay/balance), **commission tracking** (expected / earned / paid), sales targets, performance dashboard, sales achievement & conversion by salesperson.

---

## 4. Build Status (as of now — for roadmap sequencing)
| Milestone | Status |
|-----------|--------|
| **M1 — Security & Governance** | ✅ Delivered & verified |
| **M2 — Item Master & Inventory** | ✅ Delivered & verified (incl. import/export, product family, auto-pricing) |
| **M4 — Sales / SO / Delivery / Projects** | ✅ Core delivered & verified · 🟡 CRM history + alternative quotations pending |
| **M3 — Finance, Costing & Cash Flow** | ⬜ Planned (next major block) |
| **M5 — Dashboards / 360 / HR** | 🟡 Sales dashboard live · rest planned |

**Legend:** ✅ done & tested · 🟡 partly done · ⬜ planned

---

## 5. Suggested Roadmap Order (from here)
1. Finish **M4 remainder** — CRM pricing/discount history, alternative quotations, pre-delivery readiness & payment claim.
2. **M5 Dashboards & 360** — Executive, Cash-Flow, Customer/Supplier 360.
3. **M3 Finance** — landed cost, VAT advances, cash-flow forecast (largest accounting block).
4. **M5 HR** — advances, commission, targets, performance.

*This document reflects the complete scope agreed from the start. Happy to adjust priorities as you organize the long-term roadmap.*
