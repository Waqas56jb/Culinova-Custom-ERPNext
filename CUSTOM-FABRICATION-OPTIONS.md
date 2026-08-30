# Custom Fabrication — how should ERP get these items?

**For:** Client walkthrough (half-page decision note)  
**Context:** Hoods, work tables, sinks, cold rooms, and similar custom work are a real contracting line. EOS today only holds catalog equipment — it has no fabrication entries, so an “EOS-only” Item Master blocks this whole category.

---

## Option A — Create fabrication in EOS (like equipment)

**How it works:** Engineers (or admin) create fabrication “items” in EOS, complete/review/approve them, then they sync into ERP like every other product.

| Pros | Cons |
|------|------|
| One source of truth | EOS is built for equipment extraction/review, not custom fab |
| Same approve → sync habit | No natural home for family-level PDF datasheets |
| | Slower for sales/ops who just need a sellable hood/sink line |

---

## Option B — ERP exception category *(recommended)*

**How it works:** Management creates items only in category **Custom Fabrication** inside the ERP Item Master. They are tagged `item_source = fabrication` and skip the EOS-only create lock. Normal Valuation Rate → selling price still applies. Family-level datasheets live on the Product Family (Item Master doc §12).

| Pros | Cons |
|------|------|
| Unblocks contracting work immediately | Two create paths (EOS equipment vs ERP fab) |
| Matches “datasheets at family level” | Needs discipline: only Management creates fab |
| Pricing / stock stay on the familiar ERP chain | |

**Setting:** `fabrication_creation = erp` (default) or `eos` (no ERP fab button — everything waits on EOS).

---

## Recommendation

**Choose Option B** until EOS has a real fabrication workflow. Equipment stays EOS-owned; custom fab is an explicit, audited Management path in ERP. You can switch the setting back to `eos` later without a code rewrite.

*Client decides at walkthrough; this doc is the brief for that call.*
