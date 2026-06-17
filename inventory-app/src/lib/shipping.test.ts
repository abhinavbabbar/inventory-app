import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { allocateShipping, landedCostAedPerUnit, priceShipment, AllocationError } from "./shipping";

const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("allocateShipping — EQUAL_PER_UNIT", () => {
  it("splits proportionally to quantity", () => {
    const out = allocateShipping({
      totalShippingInr: d(1000),
      method: "EQUAL_PER_UNIT",
      lines: [
        { quantity: 10, unitPurchasePriceInr: d(100) }, // 1/3 of units
        { quantity: 20, unitPurchasePriceInr: d(50) }, // 2/3 of units
      ],
    });

    // Sum must equal total exactly
    expect(out[0].allocatedShippingInr.add(out[1].allocatedShippingInr).toString()).toBe("1000");
    // Line 1 gets ~333.33; line 2 absorbs the rounding remainder
    expect(out[0].allocatedShippingInr.toString()).toBe("333.33");
    expect(out[1].allocatedShippingInr.toString()).toBe("666.67");
  });

  it("handles a single-line shipment", () => {
    const out = allocateShipping({
      totalShippingInr: d(500),
      method: "EQUAL_PER_UNIT",
      lines: [{ quantity: 5, unitPurchasePriceInr: d(100) }],
    });
    expect(out[0].allocatedShippingInr.toString()).toBe("500");
  });
});

describe("allocateShipping — WEIGHTED_BY_VALUE", () => {
  it("expensive items absorb more shipping", () => {
    const out = allocateShipping({
      totalShippingInr: d(1000),
      method: "WEIGHTED_BY_VALUE",
      lines: [
        { quantity: 10, unitPurchasePriceInr: d(100) }, // value 1000
        { quantity: 10, unitPurchasePriceInr: d(300) }, // value 3000
      ],
    });

    // Total value = 4000; line 1 gets 1/4, line 2 gets 3/4
    expect(out[0].allocatedShippingInr.toString()).toBe("250");
    expect(out[1].allocatedShippingInr.toString()).toBe("750");
  });
});

describe("allocateShipping — MANUAL", () => {
  it("accepts when manual sums match within tolerance", () => {
    const out = allocateShipping({
      totalShippingInr: d(1000),
      method: "MANUAL",
      lines: [
        { quantity: 5, unitPurchasePriceInr: d(100), manualShippingInr: d(400) },
        { quantity: 5, unitPurchasePriceInr: d(100), manualShippingInr: d(600) },
      ],
    });
    expect(out[0].allocatedShippingInr.toString()).toBe("400");
    expect(out[1].allocatedShippingInr.toString()).toBe("600");
  });

  it("rejects when sum is off by more than ₹1", () => {
    expect(() =>
      allocateShipping({
        totalShippingInr: d(1000),
        method: "MANUAL",
        lines: [
          { quantity: 5, unitPurchasePriceInr: d(100), manualShippingInr: d(400) },
          { quantity: 5, unitPurchasePriceInr: d(100), manualShippingInr: d(500) },
        ],
      }),
    ).toThrow(AllocationError);
  });
});

describe("allocation invariant — sum equals total exactly", () => {
  // Property: even with awkward divisions, the sum must reconcile to the input total.
  it.each([
    { total: d("1000.00"), qtys: [3, 7] },
    { total: d("777.77"), qtys: [1, 1, 1] },
    { total: d("100.01"), qtys: [3, 3, 3] },
    { total: d("0.01"), qtys: [2, 1] },
  ])("EQUAL_PER_UNIT: total=$total, qtys=$qtys", ({ total, qtys }) => {
    const lines = qtys.map((q) => ({ quantity: q, unitPurchasePriceInr: d(100) }));
    const out = allocateShipping({ totalShippingInr: total, method: "EQUAL_PER_UNIT", lines });
    const sum = out.reduce((acc, l) => acc.add(l.allocatedShippingInr), d(0));
    expect(sum.toString()).toBe(total.toString());
  });
});

describe("landedCostAedPerUnit", () => {
  it("computes (purchase + per-unit-shipping) × fx", () => {
    // 1 unit @ ₹100 purchase, ₹50 shipping, fx 0.05 → (100 + 50) × 0.05 = 7.50 AED
    const cost = landedCostAedPerUnit({
      unitPurchasePriceInr: d(100),
      allocatedShippingInr: d(50),
      quantity: 1,
      fxRateInrToAed: d("0.05"),
    });
    expect(cost.toString()).toBe("7.5");
  });

  it("divides shipping across multiple units", () => {
    // 10 units @ ₹100 purchase, ₹500 shipping (₹50/unit), fx 0.05 → (100 + 50) × 0.05 = 7.50 AED/unit
    const cost = landedCostAedPerUnit({
      unitPurchasePriceInr: d(100),
      allocatedShippingInr: d(500),
      quantity: 10,
      fxRateInrToAed: d("0.05"),
    });
    expect(cost.toString()).toBe("7.5");
  });
});

describe("priceShipment integration", () => {
  it("returns allocated shipping + landed cost per line", () => {
    const out = priceShipment({
      totalShippingInr: d(1000),
      method: "EQUAL_PER_UNIT",
      fxRateInrToAed: d("0.05"),
      lines: [
        { quantity: 10, unitPurchasePriceInr: d(100) },
        { quantity: 10, unitPurchasePriceInr: d(200) },
      ],
    });
    expect(out).toHaveLength(2);
    // Each line gets ₹500 shipping → ₹50/unit shipping → AED (100+50)*0.05 = 7.5, (200+50)*0.05 = 12.5
    expect(out[0].landedCostAed.toString()).toBe("7.5");
    expect(out[1].landedCostAed.toString()).toBe("12.5");
  });
});
