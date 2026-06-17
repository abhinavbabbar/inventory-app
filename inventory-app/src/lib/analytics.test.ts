import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getKpis, getMonthlySeries, getTopItemsByProfit } from "./analytics";

const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const TEST_PREFIX = "VITEST-ANA-";

async function cleanup() {
  await prisma.stockMovement.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.saleLine.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.sale.deleteMany({
    where: { invoiceNumber: { startsWith: "INV-VITEST-ANA-" } },
  });
  await prisma.opexEntry.deleteMany({
    where: { notes: { startsWith: TEST_PREFIX } },
  });
  await prisma.item.deleteMany({ where: { sku: { startsWith: TEST_PREFIX } } });
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(cleanup);

describe("KPIs for a clean test scenario", () => {
  it("inventory value, MTD revenue, MTD gross + net profit", async () => {
    const item = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}KPI`, name: "KPI", unit: "pc", reorderThreshold: 0 },
    });

    // Stock IN: 10 units @ AED 5  → inventory value 50
    await prisma.stockMovement.create({
      data: { itemId: item.id, quantity: 10, type: "SHIPMENT_IN", unitCostAed: d(5) },
    });

    // Sale this month: 4 units @ AED 12, cost snapshot 5 → revenue 48, cogs 20, profit 28
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: "INV-VITEST-ANA-0001",
        soldAt: new Date(),
        vatRatePct: d(0),
        vatAmountAed: d(0),
      },
    });
    const saleLine = await prisma.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: item.id,
        quantity: 4,
        unitSalePriceAed: d(12),
        unitCostAedSnapshot: d(5),
      },
    });
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: -4,
        type: "SALE_OUT",
        saleLineId: saleLine.id,
        unitCostAed: d(5),
      },
    });

    // Opex this month: AED 10
    await prisma.opexEntry.create({
      data: {
        category: "RENT",
        amountAed: d(10),
        incurredAt: new Date(),
        notes: `${TEST_PREFIX}rent`,
      },
    });

    const kpis = await getKpis();

    // The KPIs aggregate ALL items, so we only assert that *at least* our test
    // numbers are reflected. We compare deltas relative to seeded data isn't possible
    // here; this test asserts our scenario contributes the expected amounts to MTD.
    expect(kpis.mtdRevenueAed.gte(d(48))).toBe(true);
    expect(kpis.mtdGrossProfitAed.gte(d(28))).toBe(true);
    expect(kpis.mtdOpexAed.gte(d(10))).toBe(true);
    // Net = gross − opex
    expect(kpis.mtdNetProfitAed.toString()).toBe(
      kpis.mtdGrossProfitAed.sub(kpis.mtdOpexAed).toString(),
    );

    // 6 units left @ AED 5 = AED 30
    expect(kpis.inventoryValueAed.gte(d(30))).toBe(true);
    expect(kpis.inventoryUnits).toBeGreaterThanOrEqual(6);
  });
});

describe("monthly series", () => {
  it("returns 12 contiguous months with zero-fill", async () => {
    const series = await getMonthlySeries(12);
    expect(series).toHaveLength(12);
    // Last point is current month
    const now = new Date();
    const expectedKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    expect(series[series.length - 1].monthKey).toBe(expectedKey);
  });
});

describe("top items by profit", () => {
  it("sorts items by gross profit descending", async () => {
    const a = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}HIGH`, name: "High profit", unit: "pc", reorderThreshold: 0 },
    });
    const b = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}LOW`, name: "Low profit", unit: "pc", reorderThreshold: 0 },
    });

    await prisma.stockMovement.create({
      data: { itemId: a.id, quantity: 10, type: "SHIPMENT_IN", unitCostAed: d(2) },
    });
    await prisma.stockMovement.create({
      data: { itemId: b.id, quantity: 10, type: "SHIPMENT_IN", unitCostAed: d(8) },
    });

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: "INV-VITEST-ANA-TOP1",
        soldAt: new Date(),
        vatRatePct: d(0),
        vatAmountAed: d(0),
      },
    });
    // High profit item: 5 units, AED 10 each, cost 2 → profit 40
    await prisma.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: a.id,
        quantity: 5,
        unitSalePriceAed: d(10),
        unitCostAedSnapshot: d(2),
      },
    });
    // Low profit item: 5 units, AED 10 each, cost 8 → profit 10
    await prisma.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: b.id,
        quantity: 5,
        unitSalePriceAed: d(10),
        unitCostAedSnapshot: d(8),
      },
    });

    const top = await getTopItemsByProfit(5);
    const ourRows = top.filter((r) => r.sku.startsWith(TEST_PREFIX));
    expect(ourRows[0].sku).toBe(`${TEST_PREFIX}HIGH`);
    expect(ourRows[0].grossProfit.toString()).toBe("40");
    const lowRow = ourRows.find((r) => r.sku === `${TEST_PREFIX}LOW`);
    expect(lowRow?.grossProfit.toString()).toBe("10");
  });
});
