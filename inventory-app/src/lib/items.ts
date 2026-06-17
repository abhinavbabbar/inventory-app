import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { d, sumDecimal } from "@/lib/money";

export type StockStatus = "OK" | "SHORTAGE" | "OUT";

export function stockStatus(currentStock: number, reorderThreshold: number): StockStatus {
  if (currentStock <= 0) return "OUT";
  if (currentStock < reorderThreshold) return "SHORTAGE";
  return "OK";
}

// Per-item: current stock + weighted-average cost of remaining units (AED).
export type ItemStockSummary = {
  itemId: string;
  currentStock: number;
  inventoryValueAed: Prisma.Decimal; // sum of (unitCostAed * quantity) of remaining FIFO layers
  avgLandedCostAed: Prisma.Decimal; // inventoryValueAed / currentStock (0 if no stock)
};

// Lightweight per-item summary — sums all StockMovements.quantity.
// For inventory value we walk movements as a FIFO ledger so cost reflects what's
// still on the shelf, not the historical average.
export async function getStockSummariesForItems(
  itemIds: string[],
): Promise<Map<string, ItemStockSummary>> {
  if (itemIds.length === 0) return new Map();

  const movements = await prisma.stockMovement.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: { createdAt: "asc" },
    select: {
      itemId: true,
      quantity: true,
      unitCostAed: true,
      type: true,
    },
  });

  // Group by item, then FIFO-consume sale_out movements against shipment_in layers.
  const byItem = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = byItem.get(m.itemId);
    if (list) list.push(m);
    else byItem.set(m.itemId, [m]);
  }

  const result = new Map<string, ItemStockSummary>();
  for (const itemId of itemIds) {
    const list = byItem.get(itemId) ?? [];
    const summary = computeSummaryFromMovements(itemId, list);
    result.set(itemId, summary);
  }
  return result;
}

type Movement = {
  itemId: string;
  quantity: number;
  unitCostAed: Prisma.Decimal;
  type: string;
};

function computeSummaryFromMovements(itemId: string, movements: Movement[]): ItemStockSummary {
  // FIFO layers of inbound units: { remaining, unitCost }
  type Layer = { remaining: number; unitCost: Prisma.Decimal };
  const layers: Layer[] = [];

  for (const m of movements) {
    if (m.quantity > 0) {
      // Inbound (SHIPMENT_IN or positive ADJUSTMENT)
      layers.push({ remaining: m.quantity, unitCost: m.unitCostAed });
    } else if (m.quantity < 0) {
      // Outbound — consume FIFO
      let toConsume = -m.quantity;
      while (toConsume > 0 && layers.length > 0) {
        const head = layers[0];
        if (head.remaining > toConsume) {
          head.remaining -= toConsume;
          toConsume = 0;
        } else {
          toConsume -= head.remaining;
          layers.shift();
        }
      }
      // If toConsume > 0 here, stock went negative (data integrity issue we should prevent at write time).
    }
  }

  const currentStock = layers.reduce((acc, l) => acc + l.remaining, 0);
  const inventoryValueAed = sumDecimal(layers.map((l) => l.unitCost.mul(l.remaining)));
  const avgLandedCostAed = currentStock > 0 ? inventoryValueAed.div(currentStock) : d(0);

  return {
    itemId,
    currentStock,
    inventoryValueAed,
    avgLandedCostAed,
  };
}

// FIFO consumption plan for a sale — returns the per-layer cost slices to use.
// Caller is expected to do this inside a transaction with row locks if concurrent sales are possible.
export type FifoSlice = {
  shipmentLineId: string | null;
  unitCostAed: Prisma.Decimal;
  quantity: number;
};

export async function planFifoConsumption(
  itemId: string,
  quantity: number,
): Promise<{ slices: FifoSlice[]; weightedAverageCost: Prisma.Decimal }> {
  if (quantity <= 0) {
    throw new Error("Sale quantity must be > 0");
  }

  const movements = await prisma.stockMovement.findMany({
    where: { itemId },
    orderBy: { createdAt: "asc" },
    select: {
      quantity: true,
      unitCostAed: true,
      shipmentLineId: true,
    },
  });

  type Layer = { remaining: number; unitCost: Prisma.Decimal; shipmentLineId: string | null };
  const layers: Layer[] = [];
  for (const m of movements) {
    if (m.quantity > 0) {
      layers.push({
        remaining: m.quantity,
        unitCost: m.unitCostAed,
        shipmentLineId: m.shipmentLineId,
      });
    } else if (m.quantity < 0) {
      let toConsume = -m.quantity;
      while (toConsume > 0 && layers.length > 0) {
        const head = layers[0];
        if (head.remaining > toConsume) {
          head.remaining -= toConsume;
          toConsume = 0;
        } else {
          toConsume -= head.remaining;
          layers.shift();
        }
      }
    }
  }

  // Now consume `quantity` from layers.
  let needed = quantity;
  const slices: FifoSlice[] = [];
  for (const layer of layers) {
    if (needed === 0) break;
    const take = Math.min(layer.remaining, needed);
    slices.push({
      shipmentLineId: layer.shipmentLineId,
      unitCostAed: layer.unitCost,
      quantity: take,
    });
    needed -= take;
  }
  if (needed > 0) {
    throw new Error(`Insufficient stock — short by ${needed} unit(s)`);
  }

  const totalCost = sumDecimal(slices.map((s) => s.unitCostAed.mul(s.quantity)));
  const weightedAverageCost = totalCost.div(quantity);

  return { slices, weightedAverageCost };
}
