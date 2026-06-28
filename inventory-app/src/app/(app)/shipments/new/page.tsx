import { prisma } from "@/lib/prisma";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ShipmentForm } from "./_components/shipment-form";

export const metadata = { title: "New shipment · Inventory & P&L" };

export default async function NewShipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ fromPO?: string }>;
}) {
  const { fromPO } = await searchParams;

  const [items, suppliers] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // If launched from a purchase order, pre-fill supplier + lines.
  let prefill: { fromPurchaseOrderId: string; poNumber: string; supplierId: string | null; lines: Array<{ itemId: string; quantity: string; unitPurchasePriceInr: string }> } | undefined;
  if (fromPO) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: fromPO }, include: { lines: true } });
    if (po && po.status !== "RECEIVED" && po.status !== "CANCELLED") {
      prefill = {
        fromPurchaseOrderId: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        lines: po.lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity), unitPurchasePriceInr: l.unitPurchasePriceInr.toString() })),
      };
    }
  }

  if (items.length === 0) {
    return (
      <div>
        <PageHeader
          title="New shipment"
          description="Imports from India with shipping allocation and landed cost."
        />
        <EmptyState
          title="No items in catalog yet"
          description="You need at least one item before you can record a shipment."
          action={<LinkButton href="/inventory/new">+ Create an item</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="New shipment"
        description="Imports from India. Stock is added when you submit."
      />
      <ShipmentForm items={items} suppliers={suppliers} prefill={prefill} />
    </div>
  );
}
