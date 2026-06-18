import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getAvgPurchasePriceInr, getStockSummariesForItems, stockStatus } from "@/lib/items";
import { formatAed, formatInr, formatNumber } from "@/lib/money";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import { ItemForm } from "../_components/item-form";
import { updateItem, toggleItemActive } from "../actions";
import { ToggleActiveButton } from "../_components/toggle-active-button";

export const metadata = { title: "Item · Inventory & P&L" };

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Current stock</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {formatNumber(stock)} <span className="text-sm font-normal text-neutral-500">{item.unit}</span>
          </div>
          <div className="mt-2">
            <StatusPill
              status={status === "OK" ? "ok" : status === "SHORTAGE" ? "warn" : "bad"}
              label={status === "OK" ? "In stock" : status === "SHORTAGE" ? "Shortage" : "Out"}
            />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Reorder threshold</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {formatNumber(item.reorderThreshold)}
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-indigo-500">
          <div className="text-xs text-neutral-500">Buying price (INR)</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums text-indigo-700 dark:text-indigo-400">
            {avgPurchaseInr && avgPurchaseInr.greaterThan(0) ? formatInr(avgPurchaseInr) : "—"}
          </div>
          <div className="text-xs text-neutral-500 mt-1">avg ₹/unit paid</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Avg landed cost</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {summary && stock > 0 ? formatAed(summary.avgLandedCostAed) : "—"}
          </div>
          <div className="text-xs text-neutral-500 mt-1">AED, after shipping + FX</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Inventory value</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {summary && stock > 0 ? formatAed(summary.inventoryValueAed) : "—"}
          </div>
        </Card>
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
