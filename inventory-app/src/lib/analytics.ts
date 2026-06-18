import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { d, sumDecimal } from "@/lib/money";
import { getStockSummariesForItems, stockStatus } from "@/lib/items";
import { getSupplierDuesSummary } from "@/lib/suppliers";

export type Kpis = {
  totalInvestedAed: Prisma.Decimal;
  inventoryValueAed: Prisma.Decimal;
  inventoryUnits: number;
  mtdRevenueAed: Prisma.Decimal;
  mtdGrossProfitAed: Prisma.Decimal;
  mtdOpexAed: Prisma.Decimal;
  mtdNetProfitAed: Prisma.Decimal;
  shortageCount: number;
  outCount: number;
  inProgressOrdersCount: number;
  inProgressOrdersValueAed: Prisma.Decimal;
  pendingAdvanceCount: number;
  supplierDuesInr: Prisma.Decimal;
  suppliersWithDues: number;
};

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function nextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export async function getKpis(): Promise<Kpis> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = nextMonth(monthStart);

  // Total invested across all partners
  const partners = await prisma.partner.findMany({ select: { investmentAed: true } });
  const totalInvestedAed = sumDecimal(partners.map((p) => p.investmentAed as Prisma.Decimal));

  // Inventory value: walk movements for all active items
  const items = await prisma.item.findMany({
    where: { isActive: true },
    select: { id: true, reorderThreshold: true },
  });
  const summaries = await getStockSummariesForItems(items.map((i) => i.id));

  let inventoryValueAed = d(0);
  let inventoryUnits = 0;
  let shortageCount = 0;
  let outCount = 0;
  for (const item of items) {
    const s = summaries.get(item.id);
    const stock = s?.currentStock ?? 0;
    inventoryUnits += stock;
    if (s) inventoryValueAed = inventoryValueAed.add(s.inventoryValueAed);
    const status = stockStatus(stock, item.reorderThreshold);
    if (status === "SHORTAGE") shortageCount += 1;
    if (status === "OUT") outCount += 1;
  }

  // Month-to-date P&L
  const monthSales = await prisma.sale.findMany({
    where: { soldAt: { gte: monthStart, lt: monthEnd } },
    include: {
      lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
    },
  });

  let mtdRevenueAed = d(0);
  let mtdCogsAed = d(0);
  for (const sale of monthSales) {
    for (const line of sale.lines) {
      const qty = line.quantity;
      const price = line.unitSalePriceAed as Prisma.Decimal;
      const cost = line.unitCostAedSnapshot as Prisma.Decimal;
      mtdRevenueAed = mtdRevenueAed.add(price.mul(qty));
      mtdCogsAed = mtdCogsAed.add(cost.mul(qty));
    }
  }
  const mtdGrossProfitAed = mtdRevenueAed.sub(mtdCogsAed);

  const monthOpex = await prisma.opexEntry.findMany({
    where: { incurredAt: { gte: monthStart, lt: monthEnd } },
    select: { amountAed: true },
  });
  const mtdOpexAed = sumDecimal(monthOpex.map((o) => o.amountAed as Prisma.Decimal));
  const mtdNetProfitAed = mtdGrossProfitAed.sub(mtdOpexAed);

  // Orders in progress
  const inProgressOrders = await prisma.order.findMany({
    where: { status: "IN_PROGRESS" },
    include: { lines: { select: { quantity: true, unitSalePriceAed: true } } },
  });
  let inProgressOrdersValueAed = d(0);
  let pendingAdvanceCount = 0;
  for (const o of inProgressOrders) {
    const subtotal = sumDecimal(
      o.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
    );
    inProgressOrdersValueAed = inProgressOrdersValueAed.add(
      subtotal.add(o.vatAmountAed as Prisma.Decimal),
    );
    if (
      o.advancePaidAt == null &&
      !(o.advanceAmountAed as Prisma.Decimal).isZero()
    ) {
      pendingAdvanceCount += 1;
    }
  }

  // Supplier dues (INR)
  const dues = await getSupplierDuesSummary();

  return {
    totalInvestedAed,
    inventoryValueAed,
    inventoryUnits,
    mtdRevenueAed,
    mtdGrossProfitAed,
    mtdOpexAed,
    mtdNetProfitAed,
    shortageCount,
    outCount,
    inProgressOrdersCount: inProgressOrders.length,
    inProgressOrdersValueAed,
    pendingAdvanceCount,
    supplierDuesInr: dues.totalOutstandingInr,
    suppliersWithDues: dues.suppliersWithDues,
  };
}

export type MonthlySeriesPoint = {
  monthKey: string; // YYYY-MM
  label: string; // "Jun 26"
  revenue: number;
  cogs: number;
  opex: number;
  netProfit: number;
};

export async function getMonthlySeries(months = 12): Promise<MonthlySeriesPoint[]> {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const last = nextMonth(now);

  const [sales, opex] = await Promise.all([
    prisma.sale.findMany({
      where: { soldAt: { gte: first, lt: last } },
      select: {
        soldAt: true,
        lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
      },
    }),
    prisma.opexEntry.findMany({
      where: { incurredAt: { gte: first, lt: last } },
      select: { incurredAt: true, amountAed: true },
    }),
  ]);

  const buckets = new Map<string, { revenue: Prisma.Decimal; cogs: Prisma.Decimal; opex: Prisma.Decimal }>();

  function bucketKey(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
  }

  // Pre-seed every month so the chart shows a continuous axis even with no data.
  for (let i = 0; i < months; i++) {
    const m = new Date(first.getFullYear(), first.getMonth() + i, 1);
    buckets.set(bucketKey(m), { revenue: d(0), cogs: d(0), opex: d(0) });
  }

  for (const sale of sales) {
    const key = bucketKey(sale.soldAt);
    const slot = buckets.get(key);
    if (!slot) continue;
    for (const line of sale.lines) {
      slot.revenue = slot.revenue.add(
        (line.unitSalePriceAed as Prisma.Decimal).mul(line.quantity),
      );
      slot.cogs = slot.cogs.add(
        (line.unitCostAedSnapshot as Prisma.Decimal).mul(line.quantity),
      );
    }
  }
  for (const o of opex) {
    const key = bucketKey(o.incurredAt);
    const slot = buckets.get(key);
    if (!slot) continue;
    slot.opex = slot.opex.add(o.amountAed as Prisma.Decimal);
  }

  const out: MonthlySeriesPoint[] = [];
  for (let i = 0; i < months; i++) {
    const m = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const key = bucketKey(m);
    const slot = buckets.get(key)!;
    const revenue = slot.revenue.toNumber();
    const cogs = slot.cogs.toNumber();
    const opexN = slot.opex.toNumber();
    out.push({
      monthKey: key,
      label: m.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      revenue,
      cogs,
      opex: opexN,
      netProfit: revenue - cogs - opexN,
    });
  }
  return out;
}

export type TopItemRow = {
  itemId: string;
  sku: string;
  name: string;
  unitsSold: number;
  revenue: Prisma.Decimal;
  cogs: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
};

export async function getTopItemsByProfit(limit = 5, since?: Date): Promise<TopItemRow[]> {
  const where = since ? { sale: { soldAt: { gte: since } } } : {};
  const lines = await prisma.saleLine.findMany({
    where,
    select: {
      itemId: true,
      quantity: true,
      unitSalePriceAed: true,
      unitCostAedSnapshot: true,
      item: { select: { sku: true, name: true } },
    },
  });

  const byItem = new Map<string, TopItemRow>();
  for (const line of lines) {
    const revenue = (line.unitSalePriceAed as Prisma.Decimal).mul(line.quantity);
    const cogs = (line.unitCostAedSnapshot as Prisma.Decimal).mul(line.quantity);
    const profit = revenue.sub(cogs);
    const existing = byItem.get(line.itemId);
    if (existing) {
      existing.unitsSold += line.quantity;
      existing.revenue = existing.revenue.add(revenue);
      existing.cogs = existing.cogs.add(cogs);
      existing.grossProfit = existing.grossProfit.add(profit);
    } else {
      byItem.set(line.itemId, {
        itemId: line.itemId,
        sku: line.item.sku,
        name: line.item.name,
        unitsSold: line.quantity,
        revenue,
        cogs,
        grossProfit: profit,
      });
    }
  }

  return [...byItem.values()]
    .sort((a, b) => b.grossProfit.cmp(a.grossProfit))
    .slice(0, limit);
}

export type ActivityEntry =
  | {
      kind: "shipment";
      id: string;
      reference: string;
      at: Date;
      units: number;
      totalShippingInr: Prisma.Decimal;
    }
  | {
      kind: "sale";
      id: string;
      invoiceNumber: string;
      at: Date;
      customerName: string | null;
      revenueAed: Prisma.Decimal;
    };

export async function getRecentActivity(limit = 10): Promise<ActivityEntry[]> {
  const [shipments, sales] = await Promise.all([
    prisma.shipment.findMany({
      orderBy: { shippedAt: "desc" },
      take: limit,
      include: { lines: { select: { quantity: true } } },
    }),
    prisma.sale.findMany({
      orderBy: { soldAt: "desc" },
      take: limit,
      include: {
        customer: { select: { name: true } },
        lines: { select: { quantity: true, unitSalePriceAed: true } },
      },
    }),
  ]);

  const items: ActivityEntry[] = [];
  for (const s of shipments) {
    items.push({
      kind: "shipment",
      id: s.id,
      reference: s.reference,
      at: s.shippedAt,
      units: s.lines.reduce((a, l) => a + l.quantity, 0),
      totalShippingInr: s.totalShippingInr as Prisma.Decimal,
    });
  }
  for (const s of sales) {
    const revenue = sumDecimal(
      s.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
    );
    items.push({
      kind: "sale",
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      at: s.soldAt,
      customerName: s.customer?.name ?? null,
      revenueAed: revenue,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export type PartnerShareRow = {
  partnerId: string;
  name: string;
  investmentAed: Prisma.Decimal;
  sharePct: number;
  mtdProfitShareAed: Prisma.Decimal;
};

export async function getPartnerShares(mtdNetProfit: Prisma.Decimal): Promise<PartnerShareRow[]> {
  const partners = await prisma.partner.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { investedAt: "asc" },
  });

  const total = sumDecimal(partners.map((p) => p.investmentAed as Prisma.Decimal));
  if (total.isZero()) return [];

  return partners.map((p) => {
    const inv = p.investmentAed as Prisma.Decimal;
    const sharePct = inv.div(total).mul(100).toNumber();
    const profitShare = mtdNetProfit.mul(inv).div(total);
    return {
      partnerId: p.id,
      name: p.user.name,
      investmentAed: inv,
      sharePct,
      mtdProfitShareAed: profitShare,
    };
  });
}
