import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getStockSummariesForItems, planFifoConsumption, stockStatus } from "./items";
import { landedCostAedPerUnit } from "./shipping";

const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// Test SKUs are prefixed so we can clean up without touching real data.
const TEST_PREFIX = "VITEST-ITM-";

async function makeItem(sku: string) {
  return prisma.item.create({
    data: {
      sku: `${TEST_PREFIX}${sku}`,
      name: `Test ${sku}`,
      unit: "pc",
      reorderThreshold: 5,
    },
  });
}

async function makeInbound(itemId: string, qty: number, unitCostAed: Prisma.Decimal) {
  await prisma.stockMovement.create({
    data: {
      itemId,
      quantity: qty,
      type: "SHIPMENT_IN",
      unitCostAed,
    },
  });
}

async function makeOutbound(itemId: string, qty: number, unitCostAed: Prisma.Decimal) {
  await prisma.stockMovement.create({
    data: {
      itemId,
      quantity: -qty,
      type: "SALE_OUT",
      unitCostAed,
    },
  });
}

beforeAll(async () => {
  await cleanup();
});

afterEach(async () => {
  await cleanup();
});

async function cleanup() {
  await prisma.stockMovement.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.item.deleteMany({ where: { sku: { startsWith: TEST_PREFIX } } });
}

describe("stockStatus", () => {
  it("flags OUT, SHORTAGE, OK correctly", () => {
    expect(stockStatus(0, 5)).toBe("OUT");
    expect(stockStatus(3, 5)).toBe("SHORTAGE");
    expect(stockStatus(5, 5)).toBe("OK");
    expect(stockStatus(50, 5)).toBe("OK");
  });
});

describe("stock summary", () => {
  it("computes current stock + inventory value from movements", async () => {
    const item = await makeItem("ABC");
    await makeInbound(item.id, 10, d("5.00"));
    await makeInbound(item.id, 5, d("8.00"));

    const map = await getStockSummariesForItems([item.id]);
    const s = map.get(item.id)!;

    expect(s.currentStock).toBe(15);
    // 10 × 5 + 5 × 8 = 90
    expect(s.inventoryValueAed.toString()).toBe("90");
    // 90 / 15 = 6
    expect(s.avgLandedCostAed.toString()).toBe("6");
  });

  it("FIFO-consumes outbound movements correctly", async () => {
    const item = await makeItem("FIFO");
    await makeInbound(item.id, 10, d("5.00"));
    await makeInbound(item.id, 10, d("10.00"));
    // Sell 12 — should consume all 10 @ 5.00, then 2 @ 10.00
    await makeOutbound(item.id, 12, d("0")); // outbound cost is just bookkeeping; FIFO uses inbound layers

    const map = await getStockSummariesForItems([item.id]);
    const s = map.get(item.id)!;

    // 8 units left, all from the second batch @ 10.00
    expect(s.currentStock).toBe(8);
    expect(s.inventoryValueAed.toString()).toBe("80");
    expect(s.avgLandedCostAed.toString()).toBe("10");
  });
});

describe("planFifoConsumption", () => {
  it("matches SPEC §8 acceptance test: 10@100 + 10@200, sell 15 → cost=10×100+5×200", async () => {
    const item = await makeItem("SPEC");
    await makeInbound(item.id, 10, d("100"));
    await makeInbound(item.id, 10, d("200"));

    const plan = await planFifoConsumption(item.id, 15);

    expect(plan.slices).toHaveLength(2);
    expect(plan.slices[0]).toMatchObject({ quantity: 10, unitCostAed: d("100") });
    expect(plan.slices[1]).toMatchObject({ quantity: 5, unitCostAed: d("200") });
    // Weighted average cost = (10*100 + 5*200) / 15 = 2000/15 = 133.333...
    expect(plan.weightedAverageCost.toString()).toMatch(/^133\.3+$/);
  });

  it("rejects sales that exceed available stock", async () => {
    const item = await makeItem("SHORT");
    await makeInbound(item.id, 5, d("10"));

    await expect(planFifoConsumption(item.id, 10)).rejects.toThrow(/Insufficient/);
  });
});

describe("landed cost computed from a realistic shipment", () => {
  it("simulates: 10 widgets @ ₹100, ₹500 shipping, fx 0.05 → AED 7.50/unit", async () => {
    // The shipment-creation server action does this same math.
    const unitCost = landedCostAedPerUnit({
      unitPurchasePriceInr: d(100),
      allocatedShippingInr: d(500),
      quantity: 10,
      fxRateInrToAed: d("0.05"),
    });
    expect(unitCost.toString()).toBe("7.5");

    // Now persist as a stock movement and read back
    const item = await makeItem("WIDGET");
    await makeInbound(item.id, 10, unitCost);

    const map = await getStockSummariesForItems([item.id]);
    const s = map.get(item.id)!;
    expect(s.currentStock).toBe(10);
    expect(s.avgLandedCostAed.toString()).toBe("7.5");
    expect(s.inventoryValueAed.toString()).toBe("75");
  });
});
