import { Prisma } from "@prisma/client";
import type { ShippingAllocationMethod } from "@/lib/domain";
import { d, sumDecimal } from "@/lib/money";

export type AllocationInput = {
  totalShippingInr: Prisma.Decimal;
  method: ShippingAllocationMethod;
  lines: Array<{
    quantity: number;
    unitPurchasePriceInr: Prisma.Decimal;
    manualShippingInr?: Prisma.Decimal | null;
  }>;
};

export type AllocatedLine = {
  allocatedShippingInr: Prisma.Decimal; // total for the line (qty * per-unit)
};

export class AllocationError extends Error {}

// Returns one entry per input line with allocatedShippingInr filled in.
// Guarantees: sum(allocatedShippingInr) === totalShippingInr exactly.
// Rounding remainder lands on the last line.
export function allocateShipping(input: AllocationInput): AllocatedLine[] {
  const { totalShippingInr, method, lines } = input;

  if (lines.length === 0) {
    if (!totalShippingInr.isZero()) {
      throw new AllocationError("Cannot allocate shipping to zero lines");
    }
    return [];
  }

  if (totalShippingInr.isNegative()) {
    throw new AllocationError("Total shipping cannot be negative");
  }

  switch (method) {
    case "EQUAL_PER_UNIT":
      return allocateEqualPerUnit(totalShippingInr, lines);
    case "WEIGHTED_BY_VALUE":
      return allocateWeightedByValue(totalShippingInr, lines);
    case "MANUAL":
      return allocateManual(totalShippingInr, lines);
  }
}

function allocateEqualPerUnit(
  total: Prisma.Decimal,
  lines: AllocationInput["lines"],
): AllocatedLine[] {
  const totalUnits = lines.reduce((acc, l) => acc + l.quantity, 0);
  if (totalUnits === 0) {
    throw new AllocationError("Total units must be > 0 for EQUAL_PER_UNIT");
  }

  const allocated = lines.map((line) =>
    total.mul(line.quantity).div(totalUnits).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN),
  );
  return reconcileToTotal(allocated, total);
}

function allocateWeightedByValue(
  total: Prisma.Decimal,
  lines: AllocationInput["lines"],
): AllocatedLine[] {
  const lineValues = lines.map((l) => l.unitPurchasePriceInr.mul(l.quantity));
  const totalValue = sumDecimal(lineValues);
  if (totalValue.isZero()) {
    throw new AllocationError("Total line value must be > 0 for WEIGHTED_BY_VALUE");
  }

  const allocated = lineValues.map((v) =>
    total.mul(v).div(totalValue).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN),
  );
  return reconcileToTotal(allocated, total);
}

function allocateManual(
  total: Prisma.Decimal,
  lines: AllocationInput["lines"],
): AllocatedLine[] {
  const allocated = lines.map((l, idx) => {
    if (l.manualShippingInr == null) {
      throw new AllocationError(
        `Line ${idx + 1} is missing manualShippingInr for MANUAL allocation`,
      );
    }
    if (l.manualShippingInr.isNegative()) {
      throw new AllocationError(`Line ${idx + 1} has negative manual shipping`);
    }
    return l.manualShippingInr;
  });

  const sum = sumDecimal(allocated);
  // Tolerance of ₹1 per spec
  const diff = sum.sub(total).abs();
  if (diff.greaterThan(1)) {
    throw new AllocationError(
      `Sum of manual shipping (₹${sum.toString()}) doesn't match total (₹${total.toString()})`,
    );
  }
  // Snap to exact total to keep accounting tight
  return reconcileToTotal(allocated, total);
}

// Adjust the last entry by the rounding remainder so the sum is exactly `total`.
function reconcileToTotal(
  values: Prisma.Decimal[],
  total: Prisma.Decimal,
): AllocatedLine[] {
  if (values.length === 0) return [];
  const sum = sumDecimal(values);
  const remainder = total.sub(sum);
  const adjusted = [...values];
  adjusted[adjusted.length - 1] = adjusted[adjusted.length - 1].add(remainder);
  return adjusted.map((v) => ({ allocatedShippingInr: v }));
}

// Per-unit landed cost in AED:
//   ((unitPurchasePriceInr + allocatedShippingInr / quantity) * fxRate)
// Returns Decimal rounded to 4dp for storage; caller may round further for display.
export function landedCostAedPerUnit(args: {
  unitPurchasePriceInr: Prisma.Decimal;
  allocatedShippingInr: Prisma.Decimal;
  quantity: number;
  fxRateInrToAed: Prisma.Decimal;
}): Prisma.Decimal {
  if (args.quantity <= 0) {
    throw new AllocationError("Quantity must be > 0");
  }
  const perUnitShipping = args.allocatedShippingInr.div(args.quantity);
  const perUnitInr = args.unitPurchasePriceInr.add(perUnitShipping);
  return perUnitInr.mul(args.fxRateInrToAed).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_EVEN);
}

// Convenience: compute both the allocation and the per-line landed cost in one pass.
export function priceShipment(args: {
  totalShippingInr: Prisma.Decimal;
  method: ShippingAllocationMethod;
  fxRateInrToAed: Prisma.Decimal;
  lines: Array<{
    quantity: number;
    unitPurchasePriceInr: Prisma.Decimal;
    manualShippingInr?: Prisma.Decimal | null;
  }>;
}): Array<{
  allocatedShippingInr: Prisma.Decimal;
  landedCostAed: Prisma.Decimal;
}> {
  const allocated = allocateShipping({
    totalShippingInr: args.totalShippingInr,
    method: args.method,
    lines: args.lines,
  });

  return allocated.map((a, idx) => ({
    allocatedShippingInr: a.allocatedShippingInr,
    landedCostAed: landedCostAedPerUnit({
      unitPurchasePriceInr: args.lines[idx].unitPurchasePriceInr,
      allocatedShippingInr: a.allocatedShippingInr,
      quantity: args.lines[idx].quantity,
      fxRateInrToAed: args.fxRateInrToAed,
    }),
  }));
}

export const _testing = { d };
