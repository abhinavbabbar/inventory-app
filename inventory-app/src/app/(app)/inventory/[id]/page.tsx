import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getAvgPurchasePriceInr, getStockSummariesForItems, stockStatus } from "@/lib/items";
import { formatAed, formatInr, formatNumber } from "@/lib/money";
import {
  Card,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import { ItemForm } from "../_components/item-form";
import { updateItem, toggleItemActive } from "../actions";
import { ToggleActiveButton } from "../_components/toggle-active-button";

export const metadata = { title: "Item · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const typeLabels: Record<string, string> = {
  SHIPMENT_IN: "Shipment in",
  SALE_OUT: "Sale out",
  ADJUSTMENT: "Adjustment",
};

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) notFound();

  const [summaryMap, purchaseInrMap, movements] = await Promise.all([
    getStockSummariesForItems([id]),
    getAvgPurchasePriceInr([id]),
    prisma.stockMovement.findMany({
      where: { itemId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        shipmentLine: { include: { shipment: { select: { reference: true, id: true } } } },
        saleLine: { include: { sale: { select: { invoiceNumber: true, id: true } } } },
      },
    }),
  ]);

  const summary = summaryMap.get(id);
  const avgPurchaseInr = purchaseInrMap.get(id);
  const stock = summary?.currentStock ?? 0;
  const status = stockStatus(stock, item.reorderThreshold);

  // Bind the item id into the server action.
  const updateThis = updateItem.bind(null, id);

  async function handleToggle() {
    "use server";
    await toggleItemActive(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.name}
        description={<span className="font-mono text-xs">{item.sku}</span>}
        actions={<ToggleActiveButton isActive={item.isActive} action={handleToggle} />}
      />

      {!item.isActive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200 px-4 py-2 text-sm">
          This item is inactive and hidden from inventory lists. Stock and history are preserved.
        </div>
      )}

      {item.photoUrl && (
        <Card className="p-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.photoUrl}
            alt={item.name}
            className="max-h-56 rounded-md object-contain"
          />
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatTile
          grad={status === "OK" ? "from-emerald-500 to-teal-600" : status === "SHORTAGE" ? "from-amber-500 to-orange-600" : "from-rose-500 to-red-600"}
          label="Current stock"
          value={<>{formatNumber(stock)} <span className="text-sm font-normal text-white/80">{item.unit}</span></>}
          sub={status === "OK" ? "In stock" : status === "SHORTAGE" ? "Shortage" : "Out of stock"}
        />
        <StatTile grad="from-slate-400 to-slate-500" label="Reorder threshold" value={formatNumber(item.reorderThreshold)} />
        <StatTile
          grad="from-indigo-500 to-violet-600"
          label="Buying price (INR)"
          value={avgPurchaseInr && avgPurchaseInr.greaterThan(0) ? formatInr(avgPurchaseInr) : "—"}
          sub="avg ₹/unit paid"
        />
        <StatTile
          grad="from-cyan-500 to-blue-600"
          label="Avg landed cost"
          value={summary && stock > 0 ? formatAed(summary.avgLandedCostAed) : "—"}
          sub="AED, after shipping + FX"
        />
        <StatTile
          grad="from-violet-500 to-fuchsia-600"
          label="Inventory value"
          value={summary && stock > 0 ? formatAed(summary.inventoryValueAed) : "—"}
        />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Edit details</h2>
        <ItemForm
          action={updateThis}
          submitLabel="Save changes"
          cancelHref="/inventory"
          defaultValues={{
            sku: item.sku,
            name: item.name,
            category: item.category,
            unit: item.unit,
            reorderThreshold: item.reorderThreshold,
            photoUrl: item.photoUrl,
          }}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent stock movements</h2>
        {movements.length === 0 ? (
          <EmptyState
            title="No movements yet"
            description="Stock is added when you record a shipment that includes this item."
          />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH className="text-right">Unit cost (AED)</TH>
                </TR>
              </THead>
              <tbody>
                {movements.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {dateFmt.format(m.createdAt)}
                    </TD>
                    <TD>{typeLabels[m.type] ?? m.type}</TD>
                    <TD className="font-mono text-xs">
                      {m.shipmentLine?.shipment?.reference ?? m.saleLine?.sale?.invoiceNumber ?? "—"}
                    </TD>
                    <TD className={`text-right tabular-nums ${m.quantity < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TD>
                    <TD className="text-right tabular-nums">{formatAed(m.unitCostAed)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
