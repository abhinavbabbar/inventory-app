import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { d, sumDecimal } from "@/lib/money";
import { getSupplierBalances } from "@/lib/suppliers";

type Dec = Prisma.Decimal;

// --- date range helpers -----------------------------------------------------

export type DateRange = { from: Date; to: Date; fromStr: string; toStr: string; label: string };

function ymd(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

// Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the current month.
// `to` is treated as inclusive (we add a day for the exclusive query bound).
export function parseRange(params: { from?: string; to?: string }): DateRange {
  const now = new Date();
  const defFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defTo = now;

  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? new Date(params.from + "T00:00:00") : defFrom;
  const toInclusive = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? new Date(params.to + "T00:00:00") : defTo;
  const to = new Date(toInclusive);
  to.setHours(23, 59, 59, 999);

  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
  return { from, to, fromStr: ymd(from), toStr: ymd(toInclusive), label: `${fmt.format(from)} – ${fmt.format(toInclusive)}` };
}

// --- Profit & Loss ----------------------------------------------------------

export type PnlReport = {
  revenue: Dec; // net sales (ex-VAT)
  cogs: Dec; // FIFO cost of goods sold
  grossProfit: Dec;
  opexByCategory: Array<{ category: string; amount: Dec }>;
  opexTotal: Dec;
  netProfit: Dec;
  vatCollected: Dec; // shown for reference; not part of profit
  salesCount: number;
};

export async function getPnl(range: DateRange): Promise<PnlReport> {
  const [sales, opex] = await Promise.all([
    prisma.sale.findMany({
      where: { soldAt: { gte: range.from, lte: range.to } },
      select: {
        vatAmountAed: true,
        lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
      },
    }),
    prisma.opexEntry.groupBy({
      by: ["category"],
      where: { incurredAt: { gte: range.from, lte: range.to } },
      _sum: { amountAed: true },
    }),
  ]);

  let revenue = d(0);
  let cogs = d(0);
  let vatCollected = d(0);
  for (const s of sales) {
    revenue = revenue.add(sumDecimal(s.lines.map((l) => (l.unitSalePriceAed as Dec).mul(l.quantity))));
    cogs = cogs.add(sumDecimal(s.lines.map((l) => (l.unitCostAedSnapshot as Dec).mul(l.quantity))));
    vatCollected = vatCollected.add(s.vatAmountAed as Dec);
  }
  const grossProfit = revenue.sub(cogs);

  const opexByCategory = opex
    .map((o) => ({ category: o.category, amount: (o._sum.amountAed as Dec) ?? d(0) }))
    .filter((o) => !o.amount.isZero())
    .sort((a, b) => b.amount.comparedTo(a.amount));
  const opexTotal = sumDecimal(opexByCategory.map((o) => o.amount));

  return {
    revenue,
    cogs,
    grossProfit,
    opexByCategory,
    opexTotal,
    netProfit: grossProfit.sub(opexTotal),
    vatCollected,
    salesCount: sales.length,
  };
}

// --- VAT return (output side; UAE VAT201-style summary) ---------------------

export type VatReturn = {
  standardRatedNet: Dec; // taxable supplies, net of VAT
  zeroRatedNet: Dec; // sales recorded with 0% VAT
  outputVat: Dec; // VAT collected
  invoiceCount: number;
};

export async function getVatReturn(range: DateRange): Promise<VatReturn> {
  const sales = await prisma.sale.findMany({
    where: { soldAt: { gte: range.from, lte: range.to } },
    select: {
      vatRatePct: true,
      vatAmountAed: true,
      lines: { select: { quantity: true, unitSalePriceAed: true } },
    },
  });

  let standardRatedNet = d(0);
  let zeroRatedNet = d(0);
  let outputVat = d(0);
  for (const s of sales) {
    const net = sumDecimal(s.lines.map((l) => (l.unitSalePriceAed as Dec).mul(l.quantity)));
    if ((s.vatRatePct as Dec).greaterThan(0)) standardRatedNet = standardRatedNet.add(net);
    else zeroRatedNet = zeroRatedNet.add(net);
    outputVat = outputVat.add(s.vatAmountAed as Dec);
  }

  return { standardRatedNet, zeroRatedNet, outputVat, invoiceCount: sales.length };
}

// --- Accounts receivable (who owes us), aged --------------------------------

export type ReceivableRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  orderedAt: Date;
  total: Dec;
  paid: Dec;
  remaining: Dec;
  ageDays: number;
  bucket: "current" | "d30" | "d60" | "d90";
};

export type ReceivablesReport = {
  rows: ReceivableRow[];
  buckets: { current: Dec; d30: Dec; d60: Dec; d90: Dec };
  total: Dec;
};

function bucketFor(ageDays: number): ReceivableRow["bucket"] {
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "d30";
  if (ageDays <= 90) return "d60";
  return "d90";
}

export async function getReceivablesAging(): Promise<ReceivablesReport> {
  const orders = await prisma.order.findMany({
    where: { status: { not: "CANCELLED" } },
    select: {
      id: true,
      orderNumber: true,
      orderedAt: true,
      advanceAmountAed: true,
      balanceAmountAed: true,
      customer: { select: { name: true } },
      payments: { select: { amountAed: true } },
    },
    orderBy: { orderedAt: "asc" },
  });

  const now = Date.now();
  const rows: ReceivableRow[] = [];
  const buckets = { current: d(0), d30: d(0), d60: d(0), d90: d(0) };

  for (const o of orders) {
    const total = (o.advanceAmountAed as Dec).add(o.balanceAmountAed as Dec);
    const paid = sumDecimal(o.payments.map((p) => p.amountAed as Dec));
    const remaining = total.sub(paid);
    if (!remaining.greaterThan(0)) continue;

    const ageDays = Math.floor((now - o.orderedAt.getTime()) / 86_400_000);
    const bucket = bucketFor(ageDays);
    buckets[bucket] = buckets[bucket].add(remaining);
    rows.push({
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer.name,
      orderedAt: o.orderedAt,
      total,
      paid,
      remaining,
      ageDays,
      bucket,
    });
  }

  rows.sort((a, b) => b.ageDays - a.ageDays);
  const total = buckets.current.add(buckets.d30).add(buckets.d60).add(buckets.d90);
  return { rows, buckets, total };
}

// --- Accounts payable (what we owe suppliers), in INR -----------------------

export type PayableRow = {
  supplierId: string;
  name: string;
  purchasedInr: Dec;
  paidInr: Dec;
  outstandingInr: Dec;
};

export async function getPayables(): Promise<{ rows: PayableRow[]; totalInr: Dec }> {
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));

  const rows: PayableRow[] = [];
  let totalInr = d(0);
  for (const s of suppliers) {
    const b = balances.get(s.id);
    if (!b || !b.outstandingInr.greaterThan(0)) continue;
    totalInr = totalInr.add(b.outstandingInr);
    rows.push({
      supplierId: s.id,
      name: s.name,
      purchasedInr: b.purchasedInr,
      paidInr: b.paidInr,
      outstandingInr: b.outstandingInr,
    });
  }
  rows.sort((a, b) => b.outstandingInr.comparedTo(a.outstandingInr));
  return { rows, totalInr };
}
