import { prisma } from "@/lib/prisma";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ShipmentForm } from "./_components/shipment-form";

export const metadata = { title: "New shipment · Inventory & P&L" };

export default async function NewShipmentPage() {
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
      <ShipmentForm items={items} suppliers={suppliers} />
    </div>
  );
}
