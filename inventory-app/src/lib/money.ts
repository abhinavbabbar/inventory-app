import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export function d(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const aedFmt = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 2,
});
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatInr(value: Prisma.Decimal | string | number): string {
  return inrFmt.format(toNumber(value));
}

export function formatAed(value: Prisma.Decimal | string | number): string {
  return aedFmt.format(toNumber(value));
}

export function formatNumber(value: Prisma.Decimal | string | number): string {
  return numFmt.format(toNumber(value));
}

function toNumber(value: Prisma.Decimal | string | number): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

// Round a Decimal to 2dp using banker's rounding (half-to-even).
export function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_EVEN);
}

// Sum a list of Decimals. Returns zero for an empty list.
export function sumDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, v) => acc.add(v), new Prisma.Decimal(0));
}
