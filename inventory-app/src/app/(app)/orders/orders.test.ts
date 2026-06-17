import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const TEST_PREFIX = "VITEST-ORD-";

async function cleanup() {
  await prisma.stockMovement.deleteMany({
    where: {
      OR: [
        { item: { sku: { startsWith: TEST_PREFIX } } },
        { saleLine: { item: { sku: { startsWith: TEST_PREFIX } } } },
      ],
    },
  });
  await prisma.saleLine.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.sale.deleteMany({ where: { invoiceNumber: { startsWith: "INV-VITEST-ORD-" } } });
  await prisma.lead.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.orderLine.deleteMany({
    where: { item: { sku: { startsWith: TEST_PREFIX } } },
  });
  await prisma.order.deleteMany({ where: { orderNumber: { startsWith: "ORD-VITEST-" } } });
  await prisma.item.deleteMany({ where: { sku: { startsWith: TEST_PREFIX } } });
  await prisma.customer.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("Order schema + dispatch linkage", () => {
  it("an Order can link to its dispatched Sale via saleId (unique)", async () => {
    const item = await prisma.item.create({
      data: { sku: `${TEST_PREFIX}WIDGET`, name: "Widget", unit: "pc", reorderThreshold: 0 },
    });
    await prisma.stockMovement.create({
      data: { itemId: item.id, quantity: 10, type: "SHIPMENT_IN", unitCostAed: d(5) },
    });

    const customer = await prisma.customer.create({
      data: { name: `${TEST_PREFIX}Cust`, mobile: "+971500000000" },
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-VITEST-0001",
        customerId: customer.id,
        status: "IN_PROGRESS",
        orderedAt: new Date(),
        vatRatePct: d(5),
        vatAmountAed: d(5),
        advancePct: d(50),
        advanceAmountAed: d("52.50"),
        balanceAmountAed: d("52.50"),
        advancePaidAt: new Date(),
      },
    });
    await prisma.orderLine.create({
      data: { orderId: order.id, itemId: item.id, quantity: 5, unitSalePriceAed: d(20) },
    });

    // Simulate what the dispatch action does: create Sale + SaleLine + SALE_OUT movement, link back.
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: "INV-VITEST-ORD-0001",
        customerId: customer.id,
        orderId: order.id,
        soldAt: new Date(),
        vatRatePct: order.vatRatePct,
        vatAmountAed: order.vatAmountAed,
      },
    });
    const saleLine = await prisma.saleLine.create({
      data: {
        saleId: sale.id,
        itemId: item.id,
        quantity: 5,
        unitSalePriceAed: d(20),
        unitCostAedSnapshot: d(5), // FIFO from the single layer
      },
    });
    await prisma.stockMovement.create({
      data: {
        itemId: item.id,
        quantity: -5,
        type: "SALE_OUT",
        saleLineId: saleLine.id,
        unitCostAed: d(5),
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "DISPATCHED", dispatchedAt: new Date(), saleId: sale.id },
    });

    // Verify the linkage works in both directions
    const reloaded = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { sale: { include: { lines: true } } },
    });
    expect(reloaded.status).toBe("DISPATCHED");
    expect(reloaded.sale?.invoiceNumber).toBe("INV-VITEST-ORD-0001");
    expect(reloaded.sale?.lines).toHaveLength(1);
    expect((reloaded.sale!.lines[0].unitSalePriceAed as Prisma.Decimal).toString()).toBe("20");

    // Sale.orderId is unique — a second dispatch on the same order should fail
    await expect(
      prisma.sale.create({
        data: {
          invoiceNumber: "INV-VITEST-ORD-DUP",
          customerId: customer.id,
          orderId: order.id, // duplicate
          soldAt: new Date(),
          vatRatePct: d(0),
          vatAmountAed: d(0),
        },
      }),
    ).rejects.toThrow();
  });

  it("a Lead converts to an Order and locks status to CONVERTED", async () => {
    const customer = await prisma.customer.create({
      data: { name: `${TEST_PREFIX}LeadCust` },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-VITEST-0003",
        customerId: customer.id,
        status: "IN_PROGRESS",
        orderedAt: new Date(),
        vatRatePct: d(0),
        vatAmountAed: d(0),
        advancePct: d(0),
        advanceAmountAed: d(0),
        balanceAmountAed: d(50),
      },
    });
    const lead = await prisma.lead.create({
      data: {
        name: `${TEST_PREFIX}Prospect`,
        mobile: "+971501112222",
        status: "QUALIFIED",
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "CONVERTED", convertedAt: new Date(), convertedOrderId: order.id },
    });

    const reloaded = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { convertedOrder: true },
    });
    expect(reloaded.status).toBe("CONVERTED");
    expect(reloaded.convertedOrder?.orderNumber).toBe("ORD-VITEST-0003");

    // convertedOrderId is unique — same order can't back two leads.
    const lead2 = await prisma.lead.create({
      data: { name: `${TEST_PREFIX}Other`, status: "NEW" },
    });
    await expect(
      prisma.lead.update({
        where: { id: lead2.id },
        data: { convertedOrderId: order.id },
      }),
    ).rejects.toThrow();
  });
});

describe("Order advance/balance calculation", () => {
  it("split totals correctly at 50% advance", () => {
    const subtotal = d(100);
    const vat = subtotal.mul(5).div(100); // 5
    const total = subtotal.add(vat); // 105
    const advance = total.mul(50).div(100); // 52.50
    const balance = total.sub(advance);

    expect(advance.toString()).toBe("52.5");
    expect(balance.toString()).toBe("52.5");
  });

  it("split totals correctly at 60% advance", () => {
    const subtotal = d(1000);
    const vat = subtotal.mul(5).div(100); // 50
    const total = subtotal.add(vat); // 1050
    const advance = total.mul(60).div(100); // 630
    const balance = total.sub(advance);

    expect(advance.toString()).toBe("630");
    expect(balance.toString()).toBe("420");
  });
});
