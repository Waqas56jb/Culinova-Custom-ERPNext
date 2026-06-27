# CULINOVA ERP — Requirements Status Register (honest mapping vs real code)

Legend: ✅ Done & verified · 🟡 Partial (exists but incomplete) · ❌ Missing (not built)
Source: "ERP REQUIREMENTS REGISTER – CULINOVA ERP OPTIMIZATION PROJECT.xlsx" (100 requirements).

---

## MILESTONE 1 — System Audit, Security & Governance
| ID | Requirement | Status | Real-code note |
|----|-------------|--------|----------------|
| SEC-001 | Sales can't modify selling prices w/o auth | 🟡 | Discount controlled + owner server-set; raw line-rate entry still open |
| SEC-002 | Discount limits by user role | 🟡 | Global rule (>20% approval, >25% blocked) — not yet per-role |
| SEC-003 | Discount above threshold → manager approval | ✅ | Approval + admin notification with PDF + Approve/Reject (built) |
| SEC-004 | Cost/profit hidden from Sales | ✅ | redactFinancials strips cost/GP for non-Management |
| SEC-005 | Approved SO can't change w/o workflow | ❌ | SO auto-created on accept; no SO change-approval workflow |
| SEC-006 | Reserved stock release needs Ops approval | ❌ | No stock reservation system yet |
| SEC-007 | Audit trail (quotation/SO/PO/pricing/stock) | 🟡 | audit_log + logAudit on quotations/users; not on PO/stock |

## MILESTONE 2 — Item Master & Inventory
| ID | Requirement | Status | Real-code note |
|----|-------------|--------|----------------|
| IM-001 | Remove duplicate items | 🟡 | `code` unique prevents dups; no merge/dedupe tool |
| IM-002 | Standard naming convention | 🟡 | name field; convention not enforced |
| IM-003 | Standard coding convention | 🟡 | code unique; no auto-code scheme |
| IM-004 | Supplier code mapping | 🟡 | `supplier` field only; no per-supplier item code |
| IM-005 | Dynamic item description | ❌ | not built |
| IM-006 | Mandatory sub item group | 🟡 | item_group exists; not mandatory / no sub-group |
| IM-007 | Item templates for duplication | ❌ | not built |
| IM-008 | Standardized image dimensions | ❌ | image_url only |
| IM-009 | Hide disabled items from docs | 🟡 | status field; not filtered everywhere |
| IM-010 | Special-design/custom items | 🟡 | any item can be added |
| INV-001 | Physical stock qty | ✅ | /inventory/stock enriched + Stock page column |
| INV-002 | Reserved qty | ✅ | stock_balances.reserved + Stock page column |
| INV-003 | Available qty | ✅ | physical − reserved (computed + shown) |
| INV-004 | Incoming PO qty | ✅ | summed from open POs by item |
| INV-005 | Stock aging | ✅ | days since received_at, shown on Stock page |
| INV-006 | Auto reservation on approved SO | ✅ | accept → reserveForSalesOrder (verified 3 reserved) |
| INV-007 | Reservation release approval | ✅ | request-release → Ops approve-release (verified). UI: next |
| INV-008 | Stock availability in quotations | ✅ | live AvailabilityHint in quote BOQ editor |
| INV-009 | Stock availability in BOQ | ✅ | same availability lookup endpoint |

## MILESTONE 3 — Finance, Costing & Cash Flow  ⚠️ scope clash with "ZATCA/accounting stays in ERPNext"
| ID | Requirement | Status | Real-code note |
|----|-------------|--------|----------------|
| FIN-001..009 | Landed cost (freight/customs/SABER/clearance/storage/transport/CoO/bank) | ❌ | no landed-cost engine |
| FIN-010 | Exchange rate variance | ❌ | not tracked |
| FIN-011 | True product costing | 🟡 | item.cost field only |
| FIN-012 | Project estimated cost | ✅ | BOQ budget_cost → committed_cost roll-up |
| FIN-013 | Project actual cost | ✅ | BOQ actual_cost roll-up |
| VAT-001..006 | Advance invoice mgmt + reconciliation | ❌ | not built |
| CF-001..009 | Cash flow forecast (collections/payments/salaries/rent/30-60-90) | ❌ | not built |

## MILESTONE 4 — Sales, Procurement, Projects & Delivery
| ID | Requirement | Status | Real-code note |
|----|-------------|--------|----------------|
| CRM-001 | Auto assign salesperson | 🟡 | owner = creator (auto), no territory rule |
| CRM-002 | Customer pricing history | ❌ | not aggregated |
| CRM-003 | Customer discount history | ❌ | not aggregated |
| CRM-004 | Quotation status workflow | ✅ | Open/Pending/Ordered/Lost + opportunity pipeline |
| CRM-005 | Sent status | 🟡 | send endpoint exists; no distinct "Sent" state |
| CRM-006 | Under Negotiation status | 🟡 | opportunity Negotiation; not on quotation |
| CRM-007 | Rejected status | ✅ | reject → Lost (with reason) |
| CRM-008 | Alternative quotation mgmt | ❌ | not built |
| SO-001 | Auto transfer lead time | ❌ | delivery_date captured, not as SO lead time |
| SO-002 | Auto transfer Area & Position | 🟡 | location → project; no granular Area/Position |
| SO-003 | Dual discount (% + fixed) | 🟡 | only % |
| SO-004 | Show stock availability | ❌ | not shown |
| SO-005 | Project estimated cost visibility | ✅ | budget on project |
| SO-006 | Line-level fulfillment tracking | ✅ | BOQ installation tracker 0/N |
| SO-007 | Item-level procure/inventory/delivery status | 🟡 | BOQ status only; not linked to PO/stock/DN |
| PO-001 | Supplier code mapping in PO | 🟡 | supplier name only |
| PO-002 | Exchange rate at payment | ❌ | not built |
| PO-003 | PO submission before payment | 🟡 | PO statuses exist |
| PO-004 | Supplier performance dashboard | ❌ | not built |
| DEL-001 | Area & Position in DN | ❌ | not built |
| DEL-002 | Customer signature attachment | ❌ | not built |
| DEL-003 | Customer acceptance workflow | 🟡 | quote accept exists; delivery acceptance no |
| DEL-004 | Delivery rejection workflow | ❌ | not built |
| DEL-005 | Return authorization | ❌ | not built |
| DEL-006 | Pre-delivery readiness report | ❌ | not built |
| DEL-007 | Pre-delivery payment claim | ❌ | not built |
| DEL-008 | Operational completion % | ✅ | project progress from BOQ |
| DEL-009 | Financial completion % | 🟡 | collection% field exists, not automated |
| DEL-010 | Delivered value % | 🟡 | derivable, not surfaced |
| DEL-011 | Collection progress % | 🟡 | collectionPctOf helper |

## MILESTONE 5 — Dashboards, KPI & Reporting
| ID | Requirement | Status | Real-code note |
|----|-------------|--------|----------------|
| KPI-001 | Executive dashboard | 🟡 | admin dashboard (partly mock) |
| KPI-002 | Financial dashboard | 🟡 | finance dashboard exists |
| KPI-003 | Sales dashboard | ✅ | real, live |
| KPI-004 | Procurement dashboard | 🟡 | exists |
| KPI-005 | Inventory dashboard | 🟡 | stock dashboard |
| KPI-006 | Project dashboard | 🟡 | project dashboard |
| KPI-007 | Cash flow dashboard | ❌ | needs CF engine |
| KPI-008 | Delayed projects dashboard | ❌ | not built |
| C360-001..006 | Customer 360 (quotes/SO/value/conversion/discount/outstanding) | ❌ | data exists, no consolidated 360 view |
| S360-001..005 | Supplier 360 (purchases/history/discount/lead-time/outstanding) | ❌ | not built |
| HR-001 | Leave workflow | 🟡 | leave_requests table |
| HR-002 | Employee email integration | ❌ | not built |
| HR-003 | Salary slip distribution | 🟡 | payroll_runs |
| HR-004..007 | Employee advance (request/approve/repay/balance) | ❌ | not built |
| HR-008..011 | Commission (expected/earned/paid) | ❌ | not built |
| HR-012 | Sales target management | ❌ | not built |
| HR-013 | Performance dashboard | ❌ | not built |
| HR-014 | Sales achievement % | ❌ | not built |
| HR-015 | Conversion rate by salesperson | ❌ | not built |

---

## Honest summary
- ✅ Done: ~10 (the Sales→PM→approval automation we built).
- 🟡 Partial: ~25.
- ❌ Missing: ~65 (Inventory reservation, Landed cost, VAT advances, Cash flow, Customer/Supplier 360, HR commission/advances/targets, several dashboards, delivery workflows).

## Execution plan (Critical-first, verified per batch)
1. **M2 Inventory** — reserved/available/incoming qty, auto-reservation on SO, release approval, stock visibility in quote/BOQ.
2. **M1 gaps** — per-role discount limits, SO change approval, audit on PO/stock.
3. **M4 Sales/SO/Delivery** — dual discount, lead-time/area transfer, item-level status, delivery acceptance/rejection/return, completion %.
4. **M4 Procurement** — supplier code, FX at payment, supplier performance.
5. **M5 Customer/Supplier 360 + dashboards (Exec, Inventory, Delayed projects).**
6. **M3 Finance** — landed cost, VAT advances, cash flow  ← **needs scope decision (see below).**
7. **M5 HR** — advances, commission, targets, performance.
