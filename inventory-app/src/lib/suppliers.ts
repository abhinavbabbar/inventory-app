import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { d, sumDecimal } from "@/lib/money";

export type SupplierBalance = {
  supplierId: string;
  purchasedInr: Prisma.Decimal; // goods cost across this supplier's shipments
  paidInr: Prisma.Decimal; // total payments made to the supplier
  outstandingInr: Prisma.Decimal; // purchased − paid (can be negative if overpaid/advance)
};

// Goods purchased from a supplier = sum of (unitPurchasePriceInr × qty) across their
// shipment lines. Shipping is a freight cost, not owed to the goods supplier, so it's
// excluded from the supplier balance.
export async function getSupplierBalances(
  supplierIds: string[],
): Promise<Map<string, SupplierBalance>> {
  const result = new Map<string, SupplierBalance>();
  if (supplierIds.length === 0) return result;

  const [shipments, payments] = await Promise.all([
    prisma.shipment.findMany({
      where: { supplierId: { in: supplierIds } },
      select: {
        supplierId: true,
        lines: { select: { quantity: true, unitPurchasePriceInr: true } },
      },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { supplierId: { in: supplierIds } },
      _sum: { amountInr: true },
    }),
  ]);

  const purchasedBy = new Map<string, Prisma.Decimal>();
  for (const s of shipments) {
    if (!s.supplierId) continue;
    const goods = sumDecimal(
      s.lines.map((l) => (l.unitPurchasePriceInr as Prisma.Decimal).mul(l.quantity)),
    );
    purchasedBy.set(s.supplierId, (purchasedBy.get(s.supplierId) ?? d(0)).add(goods));
  }

  const paidBy = new Map<string, Prisma.Decimal>();
  for (const p of payments) {
    paidBy.set(p.supplierId, (p._sum.amountInr as Prisma.Decimal) ?? d(0));
  }

  for (const id of supplierIds) {
    const purchasedInr = purchasedBy.get(id) ?? d(0);
    const paidInr = paidBy.get(id) ?? d(0);
    result.set(id, {
      supplierId: id,
      purchasedInr,
      paidInr,
      outstandingInr: purchasedInr.sub(paidInr),
    });
  }
  return result;
}

// Totals across all suppliers — used by the dashboard.
export async function getSupplierDuesSummary(): Promise<{
  totalPurchasedInr: Prisma.Decimal;
  totalPaidInr: Prisma.Decimal;
  totalOutstandingInr: Prisma.Decimal; // only positive balances (money still owed)
  suppliersWithDues: number;
}> {
  const suppliers = await prisma.supplier.findMany({ select: { id: true } });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));

  let totalPurchasedInr = d(0);
  let totalPaidInr = d(0);
  let totalOutstandingInr = d(0);
  let suppliersWithDues = 0;
  for (const b of balances.values()) {
    totalPurchasedInr = totalPurchasedInr.add(b.purchasedInr);
    totalPaidInr = totalPaidInr.add(b.paidInr);
    if (b.outstandingInr.greaterThan(0)) {
      totalOutstandingInr = totalOutstandingInr.add(b.outstandingInr);
      suppliersWithDues += 1;
    }
  }
  return { totalPurchasedInr, totalPaidInr, totalOutstandingInr, suppliersWithDues };
}
