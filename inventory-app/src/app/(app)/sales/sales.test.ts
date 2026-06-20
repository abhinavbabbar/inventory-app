import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const TEST_PREFIX = "VITEST-SALE-";

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

async function cleanup() {
  await prisma.stockMovement.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.saleLine.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.sale.deleteMany({
    where: { invoiceNumber: { startsWith: "INV-VITEST-" } },
  });
  await prisma.item.deleteMany({ where: { sku: { startsWith: TEST_PREFIX } } });
  await prisma.customer.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

describe("sale flow — schema + writes", () => {
  it("writes Sale + SaleLine + SALE_OUT movements with FIFO cost snapshot", async () => {
    const item = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}A`, name: "Test A", unit: "pc", reorderThreshold: 0 },
    });

    // Two inbound layers: 10 @ AED 5, then 10 @ AED 10
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: 10,
        type: "SHIPMENT_IN",
        unitCostAed: d(5),
      },
    });
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: 10,
        type: "SHIPMENT_IN",
        unitCostAed: d(10),
      },
    });

    // Sell 15 at AED 20 each → consumes 10 @ 5 + 5 @ 10 → weighted avg cost = (50+50)/15
    const customer = await prisma.customer.create({
      data: { name: `${TEST_PREFIX}Cust`, mobile: "+971 50 0000000" },
    });

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: "INV-VITEST-0001",
        customerId: customer.id,
        soldAt: new Date(),
        vatRatePct: d(5),
        vatAmountAed: d(15), // 15 * 20 * 0.05 = 15
      },
    });

    const avgCost = d("100").div(15); // 6.6666... — what FIFO yields
    const saleLine = await prisma.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: item.id,
        quantity: 15,
        unitSalePriceAed: d(20),
        unitCostAedSnapshot: avgCost,
      },
    });

    // Per-slice stock movements
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: -10,
        type: "SALE_OUT",
        saleLineId: saleLine.id,
        unitCostAed: d(5),
      },
    });
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: -5,
        type: "SALE_OUT",
        saleLineId: saleLine.id,
        unitCostAed: d(10),
      },
    });

    // Verify: remaining 5 units @ AED 10 cost
    const movements = await prisma.stockMovement.findMany({
      where: { itemId: item.id },
      orderBy: { createdAt: "asc" },
    });
    const remaining = movements.reduce((acc, m) => acc + m.quantity, 0);
    expect(remaining).toBe(5);

    // Sale total stored correctly
    const reloaded = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { lines: true },
    });
    expect(reloaded.lines).toHaveLength(1);
    expect(reloaded.lines[0].unitCostAedSnapshot.toString()).toMatch(/^6\.6+/);
    expect((reloaded.vatAmountAed as Prisma.Decimal).toString()).toBe("15");
  });

  it("invoice number uniqueness is enforced", async () => {
    const item = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}DUP`, name: "Dup", unit: "pc", reorderThreshold: 0 },
    });
    await prisma.stockMovement.create({
      data: { itemId: item.id, quantity: 1, type: "SHIPMENT_IN", unitCostAed: d(1) },
    });

    await prisma.sale.create({
      data: {
        invoiceNumber: "INV-VITEST-DUP-0001",
        soldAt: new Date(),
        vatRatePct: d(0),
        vatAmountAed: d(0),
      },
    });

    await expect(
      prisma.sale.create({
        data: {
          invoiceNumber: "INV-VITEST-DUP-0001",
          soldAt: new Date(),
          vatRatePct: d(0),
          vatAmountAed: d(0),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("invoice PDF rendering", () => {
  it("renders a non-empty PDF for a typical sale with VAT", async () => {
    const buffer = await renderInvoicePdf({
      company: {
        name: "Acme Trading FZE",
        tagline: "",
        address: "Dubai, UAE",
        trn: "100123456700003",
        logoUrl: "",
      },
      vat: { label: "VAT", registrationNumber: "100123456700003" },
      sale: {
        invoiceNumber: "INV-TEST-001",
        soldAt: new Date("2026-06-15"),
        placeOfSale: "Exhibition",
        vatRatePct: d(5),
        vatAmountAed: d("12.5"),
        notes: null,
      },
      customer: {
        name: "Test Customer",
        mobile: "+971 50 1234567",
        email: "cust@example.com",
        deliveryAddress: "Marina Tower, Dubai",
      },
      lines: [
        {
          description: "Widget",
          sku: "WGT-1",
          quantity: 5,
          unitSalePriceAed: d(50),
        },
      ],
    });
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(500);
    // PDF files start with %PDF
    expect(buffer.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("renders for a walk-in customer with no VAT", async () => {
    const buffer = await renderInvoicePdf({
      company: { name: "Acme", tagline: "", address: "", trn: "", logoUrl: "" },
      vat: { label: "VAT", registrationNumber: null },
      sale: {
        invoiceNumber: "INV-TEST-002",
        soldAt: new Date(),
        placeOfSale: null,
        vatRatePct: d(0),
        vatAmountAed: d(0),
        notes: "Paid in cash",
      },
      customer: null,
      lines: [
        { description: "Thingamajig", sku: "TJ-1", quantity: 1, unitSalePriceAed: d(100) },
      ],
    });
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.toString("utf8", 0, 4)).toBe("%PDF");
  });
});
