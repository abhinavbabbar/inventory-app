import { prisma } from "@/lib/prisma";
import { getStockSummariesForItems } from "@/lib/items";
import { getVatSettings } from "@/lib/settings";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { SaleForm } from "./_components/sale-form";

export const metadata = { title: "New sale · BookWise" };

export default async function NewSalePage() {
  const [customers, items, vatSettings] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, mobile: true, email: true },
    }),
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true },
    }),
    getVatSettings(),
  ]);

  if (items.length === 0) {
    return (
      <div>
        <PageHeader title="New sale" description="Record an order." />
        <EmptyState
          title="No items in catalog yet"
          description="You need at least one item with stock before you can record a sale."
          action={<LinkButton href="/inventory/new">+ Create an item</LinkButton>}
        />
      </div>
    );
  }

  const summaries = await getStockSummariesForItems(items.map((i) => i.id));
  const itemsWithStock = items.map((i) => ({
    ...i,
    currentStock: summaries.get(i.id)?.currentStock ?? 0,
  }));

  const anyStock = itemsWithStock.some((i) => i.currentStock > 0);
  if (!anyStock) {
    return (
      <div>
        <PageHeader title="New sale" description="Record an order." />
        <EmptyState
          title="No stock available"
          description="Record a shipment first to bring stock into inventory."
          action={<LinkButton href="/shipments/new">+ New shipment</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="New sale" description="Stock is decremented on save using FIFO cost." />
      <SaleForm
        customers={customers}
        items={itemsWithStock}
        defaultVatRatePct={vatSettings.defaultRatePct}
        vatEnabled={vatSettings.enabled}
      />
    </div>
  );
}
