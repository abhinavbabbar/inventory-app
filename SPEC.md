# Inventory & Partnership P&L — Specification

**Status:** Draft v1
**Last updated:** 2026-06-15

A web + mobile (PWA) application for a two-partner business that imports goods from India (INR) and sells them in the UAE (AED). Tracks inventory, landed cost, sales, opex, and per-partner P&L.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, TypeScript) | One codebase for web + PWA, server actions remove the need for a separate API |
| UI | **Tailwind CSS + shadcn/ui** | Production-quality components, fast to build |
| Database | **PostgreSQL** (Neon free tier) | Relational data with strong consistency for money |
| ORM | **Prisma** | Type-safe queries, easy migrations |
| Auth | **NextAuth.js** with credentials provider + RBAC | Roles configurable per user |
| Charts | **Recharts** | Clean React-native charting |
| PDF invoices | **@react-pdf/renderer** | Server-side PDF generation |
| Forms | **react-hook-form + zod** | Validation that runs on client and server |
| Deployment | **Vercel** + Neon | Free tier covers this workload |
| Mobile | **PWA** (installable on iOS/Android) | No app store, ships as fast as the web build |

Money values stored as `Decimal(14, 4)` — never floats. All currency amounts are tagged with a `currency` field (`INR` or `AED`).

---

## 2. Roles & Permissions

Three predefined roles, with permission flags that can be adjusted per user:

| Resource | PARTNER | ADMIN | STAFF (default) |
|---|---|---|---|
| View dashboard & financials | yes | yes | no (configurable) |
| Create/edit inventory items | yes | yes | yes |
| Record shipments | yes | yes | configurable |
| Record sales | yes | yes | yes |
| Generate invoices | yes | yes | yes |
| Manage opex | yes | yes | no |
| Manage users & roles | no | yes | no |
| Manage partner investments | no | yes | no |

Partners are users with role `PARTNER` **and** a row in the `Partner` table (investment record).

---

## 3. Data Model

```
User              id, email, passwordHash, name, role (PARTNER|ADMIN|STAFF), permissions (JSON overrides), createdAt
Partner           id, userId (FK), investmentAed (Decimal — denormalized running total), investedAt, notes
PartnerInvestment id, partnerId (FK), amountAed (Decimal), contributedAt, notes, createdAt
                  -- one dated row per capital contribution (top-up); Partner.investmentAed = sum(amountAed)
Item              id, sku (unique), name, category, unit, reorderThreshold, photoUrl, isActive
Shipment          id, reference, shippedAt, arrivedAt, fxRateInrToAed (Decimal), totalShippingInr (Decimal),
                  shippingAllocationMethod (EQUAL_PER_UNIT|WEIGHTED_BY_VALUE|MANUAL), notes
ShipmentLine      id, shipmentId (FK), itemId (FK), quantity, unitPurchasePriceInr (Decimal),
                  manualShippingInr (Decimal, nullable), allocatedShippingInr (computed on save),
                  landedCostAed (computed on save)
StockMovement     id, itemId (FK), quantity (signed), type (SHIPMENT_IN|SALE_OUT|ADJUSTMENT),
                  refId (shipmentLineId or saleLineId), unitCostAed (snapshot of landed cost), createdAt
Customer          id, name, email, mobile, deliveryAddress, notes, createdAt, isActive
Lead              id, name, mobile, email, deliveryAddress, notes, source, status, assignedToUserId,
                  convertedOrderId, convertedAt, createdAt, updatedAt
                  -- status: NEW | CONTACTED | QUALIFIED | CONVERTED | LOST
Order             id, orderNumber (auto), customerId (FK, required), leadId (FK, nullable),
                  status, orderedAt, expectedDispatchAt, dispatchedAt, cancelledAt,
                  vatRatePct, vatAmountAed,
                  advancePct, advanceAmountAed, advancePaidAt,
                  balanceAmountAed, balancePaidAt,
                  saleId (FK, nullable — set when dispatched), notes
                  -- status: IN_PROGRESS | DISPATCHED | CANCELLED
OrderLine         id, orderId (FK), itemId (FK), quantity, unitSalePriceAed
Sale              id, invoiceNumber (auto), customerId (FK, nullable for walk-ins), orderId (FK, nullable),
                  soldAt, notes, vatRatePct (Decimal, snapshot at sale time), vatAmountAed (Decimal)
SaleLine          id, saleId (FK), itemId (FK), quantity, unitSalePriceAed (Decimal),
                  unitCostAedSnapshot (Decimal)  -- FIFO cost at time of sale
OpexEntry         id, category (RENT|SALARY|UTILITY|TRANSPORT|MARKETING|OTHER), amountAed, incurredAt, notes
Setting           key, value  -- company info for invoices, default FX, VAT settings, etc.
```

**Indexes:** `StockMovement(itemId, createdAt)`, `Sale(soldAt)`, `Shipment(arrivedAt)`, `OpexEntry(incurredAt)`, `Customer(mobile)`, `Customer(email)`, `Lead(status, createdAt)`, `Lead(mobile)`, `Order(status, orderedAt)`, `Order(customerId)`.

---

## 4. Business Logic

### 4.1 Shipping allocation (per shipment, configurable)

Per the user decision, the method is chosen when creating each shipment.

- **EQUAL_PER_UNIT** — `lineShipping = totalShippingInr × (lineQty / totalUnitsInShipment)`
- **WEIGHTED_BY_VALUE** — `lineShipping = totalShippingInr × (lineValueInr / totalValueInr)`
- **MANUAL** — operator enters `manualShippingInr` per line; sum must equal `totalShippingInr` (validated on save, tolerance ₹1).

### 4.2 Landed cost per unit (in AED)

```
unitLandedCostAed = (unitPurchasePriceInr + (allocatedShippingInr / quantity)) × fxRateInrToAed
```

Stored on `ShipmentLine.landedCostAed` at save time. This snapshot is what `StockMovement.unitCostAed` references — the AED cost is locked at the moment of import, immune to later FX swings.

### 4.3 FIFO cost on sale

When a sale line is recorded, the system pulls the oldest available units (by `StockMovement.createdAt` where `type=SHIPMENT_IN`) and uses their `unitCostAed` as `SaleLine.unitCostAedSnapshot`. If the sale spans multiple cost layers, the sale line is split internally (per-layer cost rows in a `SaleLineCostSlice` table — added if the UI needs to show it; otherwise a weighted average is stored).

### 4.4 Stock levels

```
currentStock(item) = sum(StockMovement.quantity where itemId = item)
shortageStatus     = currentStock < reorderThreshold ? 'SHORTAGE' : (currentStock == 0 ? 'OUT' : 'OK')
```

### 4.5 Profit & Loss

- **Gross profit per sale line** = `(unitSalePriceAed − unitCostAedSnapshot) × quantity`
- **Gross profit period** = sum of gross profit across all sale lines in date range
- **Net profit period** = `grossProfitPeriod − opexInPeriod`  (opex tracked separately per decision)
- **Per-partner share** = `netProfit × (partner.investmentAed / sum(allInvestmentsAed))`

**Partner-funded opex (fronted cost).** An `OpexEntry` may be attributed to a partner via
`paidByPartnerId`. This is treated as a **reimbursable cost the partner fronted** — it does **not**
count toward equity or ownership share. `Partner.investmentAed = sum(capital ledger)` only, and
share % is derived from capital alone. The partner detail view lists these under a separate
"Fronted costs" header (informational/reimbursable). Opex still appears in the P&L (it reduces net
profit) regardless of who funded it.

### 4.6 Orders, advance payment, and dispatch

**Two sale paths:**

1. **Direct sale** (`/sales/new`) — walk-in/counter sale. Creates a `Sale` immediately, decrements stock via FIFO.
2. **Order flow** — customer places an order (often with advance payment), stock is dispatched later. Flow:
   ```
   Lead ──convert──▶  Order (IN_PROGRESS)  ──dispatch──▶  Sale (existing FIFO path)
                       │
                       ├─ advance %  → advance amount
                       └─ balance    → balance amount
   ```

**Order totals:**
```
subtotal       = Σ (line.unitSalePriceAed × line.quantity)
vatAmount      = subtotal × (vatRatePct / 100)
total          = subtotal + vatAmount
advanceAmount  = total × (advancePct / 100)
balanceAmount  = total − advanceAmount
```

**Stock is NOT reserved at order creation.** Stock is consumed at dispatch time via the same FIFO engine used for direct sales. If stock isn't available at dispatch, the operator sees the shortfall and the dispatch is blocked.

**Dispatch flow** (transactional):
1. Validate stock available for every line
2. Run FIFO consumption per line; snapshot `unitCostAedSnapshot`
3. Create `Sale` row with `orderId` linking back; copy customer, VAT snapshot, line items
4. Create `SaleLine` rows; one `SALE_OUT` `StockMovement` per FIFO slice
5. Mark `Order.status = DISPATCHED`, set `Order.dispatchedAt` and `Order.saleId`

**Payment tracking** — two timestamp flags: `advancePaidAt` and `balancePaidAt`. UI shows three states:
- Pending advance (advance not yet received)
- Advance paid (balance outstanding)
- Fully paid

**Dispatch gate:** if advance isn't marked paid, dispatch shows a warning but proceeds (operator-trusted, per the user's call).

### 4.7 Investment percentage

```
partner.sharePct = partner.investmentAed / sum(allPartners.investmentAed) × 100
```

Partners contribute capital over time. Each contribution is a dated `PartnerInvestment`
ledger row; `Partner.investmentAed` is a denormalized running total recomputed (inside a
transaction) whenever a contribution is added or deleted. Share % is derived live from these
totals, so a top-up automatically re-weights every partner's ownership and profit split.

---

## 5. Features

### 5.1 Dashboard (`/dashboard`)
- KPI cards: **Total invested (AED)**, **Inventory value at cost (AED)**, **Inventory units**, **MTD revenue**, **MTD net profit**, **Shortage count**
- Charts:
  - Revenue vs Cost vs Opex — last 12 months (stacked bar)
  - Inventory value over time (line)
  - Top 5 items by profit (horizontal bar)
- Partner share table: name, investment, %, share of MTD net profit
- Recent activity feed (last 10 shipments + sales)

### 5.2 Inventory (`/inventory`)
- Table: SKU, name, category, current stock, reorder threshold, avg landed cost, status pill (OK / Shortage / Out)
- Filters: category, status, search by SKU/name
- Row actions: view history (movements), edit item, add stock (shortcut to "add to existing shipment" flow)
- "Add new item" form: SKU, name, category, unit, reorder threshold, photo
- Item detail page: stock history chart, all movements table, cost history

### 5.3 Shipments (`/shipments`)
- List view: reference, date, item count, total INR cost, total AED landed cost, status
- New shipment wizard:
  1. **Header** — reference, dates, FX rate, total shipping INR, allocation method, notes
  2. **Lines** — add items (autocomplete by SKU/name) with qty and unit INR price; optionally upload from CSV. If allocation is MANUAL, per-line shipping input appears.
  3. **Preview** — table shows computed per-line `allocatedShippingInr` and `landedCostAed`; subtotal check for MANUAL
  4. **Confirm** — creates ShipmentLines and `SHIPMENT_IN` StockMovements
- Shipment detail page with the same allocation preview, plus a printable summary

### 5.4 Customers (`/customers`)
- List view: name, mobile, email, # of orders, lifetime spend (AED), last order date
- Search/filter by name, mobile, email
- Add/edit form: **name** (required), **mobile** (required, unique-soft), **email**, **delivery address**, notes
- Customer detail page: contact info, full order history table, lifetime metrics
- Soft-delete via `isActive` flag (preserves invoice history)

### 5.5 Sales (`/sales`)
- List view: invoice #, date, customer, total AED, gross profit, status
- New sale flow:
  1. **Customer** — search existing (by name/mobile/email) or "+ New customer" inline (name, mobile, email, delivery address). Walk-in allowed: leave customer blank → invoice prints "Walk-in customer".
  2. **Lines** — autocomplete item, qty, unit AED sale price. Stock validated: cannot oversell. Shows live gross profit per line.
  3. **VAT** — VAT rate pre-filled from Settings (default-enabled or disabled per config); editable per sale. Sale stores the rate snapshot so historical invoices stay correct even if the default changes later.
  4. **Confirm** → creates Sale, SaleLines, `SALE_OUT` StockMovements, generates invoice PDF
- Sale detail page with downloadable/printable invoice PDF

### 5.6 Opex (`/opex`)
- Simple table with add/edit, category, amount AED, date, notes
- Monthly total card

### 5.7 Partners (`/partners`) — ADMIN only
- List partners with investment, share %, lifetime profit share
- Add/edit investment entries (audit-logged)

### 5.8 Settings (`/settings`) — ADMIN only
- Company info for invoices (name, address, TRN, logo)
- Default FX rate (pre-fills new shipments)
- **VAT configuration:**
  - `vatEnabled` (boolean) — when off, sales flow skips VAT entirely and invoices show no tax line
  - `defaultVatRatePct` (Decimal, e.g. 5.00) — pre-fills new sales; editable per sale
  - `vatRegistrationNumber` (string, the TRN) — printed on invoices when set
  - `vatLabel` (string, default "VAT") — for businesses using "GST" or another label
- User management: invite, set role, override permissions

### 5.9 Invoice PDF
- Company header (logo, name, address, TRN if set)
- Invoice #, date
- Customer block: name, mobile, email, delivery address (or "Walk-in customer")
- Itemized lines (description, qty, unit price AED, line total)
- Subtotal, **VAT line (only rendered when sale has `vatRatePct > 0`)**, Total
- Footer with payment terms

---

## 6. Out of scope (v1)

- Multi-warehouse / multi-location inventory
- Barcode scanning (can be added in v2 via browser camera)
- Purchase orders / supplier management beyond simple shipment records
- Bank reconciliation, payment tracking (sales are assumed paid; can add later)
- Returns / refunds (v2)
- Multi-currency selling (UAE side is AED only)
- Tax filing reports beyond a basic VAT summary
- Native iOS/Android apps (PWA only)

---

## 7. Implementation phases

1. **Foundation** — Next.js scaffold, Prisma schema, NextAuth, RBAC middleware, layout shell
2. **Inventory + Shipments** — CRUD, shipping allocation engine, landed cost calculation, stock movements
3. **Sales + Invoicing** — Sale flow, FIFO costing, PDF invoice generation
4. **Opex + Dashboard** — Opex CRUD, KPI calculations, charts
5. **Partners + Settings** — Investments, share %, user management
6. **Polish** — PWA manifest, offline shell, mobile-responsive review, seed data, deployment

Each phase ends with a working slice you can click through.

---

## 8. Acceptance criteria (the things this app must get right)

- Money never displays a float artifact (`12.345` → `12.35` rounding only at display, never in storage)
- INR amounts never silently mix with AED — every monetary field is tagged with its currency in the UI
- FIFO cost-of-goods is provably correct (test: import 10 units @ ₹100, then 10 @ ₹200, sell 15 — expect cost = 10×₹100 + 5×₹200)
- Shipping allocation totals reconcile to the shipment header (sum of line allocations == total shipping, within ₹1)
- Stock cannot go negative (sale flow blocks oversells)
- Invoice PDFs are pixel-stable across reprints (same input → byte-identical output)
- Dashboard KPIs match a manual spreadsheet calculation on the seed dataset
