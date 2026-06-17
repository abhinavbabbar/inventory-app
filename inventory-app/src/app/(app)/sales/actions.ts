"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { d, round2, sumDecimal } from "@/lib/money";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number");

const decimalStringNonNegative = decimalString.refine((v) => !v.startsWith("-"), "Must be non-negative");

const saleLineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().int().positive(),
  unitSalePriceAed: decimalStringNonNegative,
});

// Customer can be: existing (customerId set), inline new (newCustomer.* set), or walk-in (both empty).
const saleSchema = z.object({
  customerId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  newCustomerName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  newCustomerMobile: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  newCustomerEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  newCustomerAddress: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  soldAt: z.coerce.date(),
  placeOfSale: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  vatRatePct: decimalStringNonNegative,
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v ?? null),
  lines: z.array(saleLineSchema).min(1, "At least one line is required"),
});

export type SaleFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
    lines?: Array<Partial<Record<string, string>> | undefined>;
  };
};

export async function createSale(
  _prev: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const session = await auth();
  if (!session?.user) return { errors: { form: "Unauthorized" } };
  if (!can(session.user, "sales", "create")) return { errors: { form: "Forbidden" } };

  const linesRaw = formData.get("lines");
  let linesJson: unknown;
  try {
    linesJson = JSON.parse(typeof linesRaw === "string" ? linesRaw : "[]");
  } catch {
    return { errors: { form: "Invalid line items payload" } };
  }

  const parsed = saleSchema.safeParse({
    customerId: formData.get("customerId"),
    newCustomerName: formData.get("newCustomerName"),
    newCustomerMobile: formData.get("newCustomerMobile"),
    newCustomerEmail: formData.get("newCustomerEmail"),
    newCustomerAddress: formData.get("newCustomerAddress"),
    soldAt: formData.get("soldAt"),
    placeOfSale: formData.get("placeOfSale"),
    vatRatePct: formData.get("vatRatePct"),
    notes: formData.get("notes"),
    lines: linesJson,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const data = parsed.data;
  const vatRate = new Prisma.Decimal(data.vatRatePct);

  // Verify all items exist + active.
  const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, isActive: true, name: true, sku: true },
  });
  if (items.length !== itemIds.length || items.some((i) => !i.isActive)) {
    return { errors: { form: "One or more selected items are no longer available" } };
  }

  // Up to 3 retries in case of invoice number collision under concurrent writes.
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const sale = await prisma.$transaction(async (tx) => {
        // Resolve customer: existing, inline new, or walk-in (null).
        let customerId: string | null = data.customerId;
        if (!customerId && data.newCustomerName) {
          const created = await tx.customer.create({
            data: {
              name: data.newCustomerName,
              mobile: data.newCustomerMobile,
              email: data.newCustomerEmail,
              deliveryAddress: data.newCustomerAddress,
            },
          });
          customerId = created.id;
        }

        // Compute FIFO consumption + cost snapshots per line.
        const lineComputes = [];
        let subtotal = d(0);

        for (let i = 0; i < data.lines.length; i++) {
          const line = data.lines[i];
          const unitPrice = new Prisma.Decimal(line.unitSalePriceAed);

          // FIFO consumption: read movements, replay layers in JS.
          const movements = await tx.stockMovement.findMany({
            where: { itemId: line.itemId },
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

          let needed = line.quantity;
          const slices: Array<{
            unitCost: Prisma.Decimal;
            quantity: number;
            shipmentLineId: string | null;
          }> = [];
          for (const layer of layers) {
            if (needed === 0) break;
            const take = Math.min(layer.remaining, needed);
            slices.push({
              unitCost: layer.unitCost,
              quantity: take,
              shipmentLineId: layer.shipmentLineId,
            });
            needed -= take;
          }
          if (needed > 0) {
            const item = items.find((it) => it.id === line.itemId);
            throw new InsufficientStockError(
              `Not enough stock for ${item?.name ?? "item"} — short by ${needed}`,
            );
          }

          const totalCost = sumDecimal(slices.map((s) => s.unitCost.mul(s.quantity)));
          const avgUnitCost = totalCost.div(line.quantity);
          const lineSubtotal = unitPrice.mul(line.quantity);
          subtotal = subtotal.add(lineSubtotal);

          lineComputes.push({
            line,
            unitPrice,
            avgUnitCost,
            slices,
          });
        }

        const vatAmount = round2(subtotal.mul(vatRate).div(100));

        // Invoice number: INV-YYYYMMDD-NNNN by daily count
        const today = startOfDay(data.soldAt);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const dailyCount = await tx.sale.count({
          where: { soldAt: { gte: today, lt: tomorrow } },
        });

        const datePart = formatYYYYMMDD(today);
        const invoiceNumber = `INV-${datePart}-${(dailyCount + 1).toString().padStart(4, "0")}`;

        const saleRow = await tx.sale.create({
          data: {
            invoiceNumber,
            customerId,
            soldAt: data.soldAt,
            placeOfSale: data.placeOfSale,
            vatRatePct: vatRate,
            vatAmountAed: vatAmount,
            notes: data.notes,
          },
        });

        // Create SaleLines + StockMovements (one StockMovement per FIFO slice for full audit trail).
        for (const lc of lineComputes) {
          const saleLine = await tx.saleLine.create({
            data: {
              saleId: saleRow.id,
              itemId: lc.line.itemId,
              quantity: lc.line.quantity,
              unitSalePriceAed: lc.unitPrice,
              unitCostAedSnapshot: lc.avgUnitCost,
            },
          });

          for (const slice of lc.slices) {
            await tx.stockMovement.create({
              data: {
                itemId: lc.line.itemId,
                quantity: -slice.quantity,
                type: "SALE_OUT",
                saleLineId: saleLine.id,
                shipmentLineId: slice.shipmentLineId,
                unitCostAed: slice.unitCost,
              },
            });
          }
        }

        return saleRow;
      });

      revalidatePath("/sales");
      revalidatePath("/inventory");
      revalidatePath("/customers");
      redirect(`/sales/${sale.id}`);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      if (err instanceof InsufficientStockError) {
        return { errors: { form: err.message } };
      }
      if (isUniqueConstraintError(err) && attempt < MAX_RETRIES - 1) {
        // Invoice number race — retry.
        continue;
      }
      throw err;
    }
  }

  return { errors: { form: "Failed to create sale after multiple attempts" } };
}

class InsufficientStockError extends Error {}

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYYYYMMDD(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

function fieldErrors(error: z.ZodError): SaleFormState {
  const fields: Record<string, string> = {};
  const lines: Array<Partial<Record<string, string>> | undefined> = [];
  for (const issue of error.issues) {
    const [first, second, third] = issue.path;
    if (first === "lines" && typeof second === "number") {
      const slot = lines[second] ?? {};
      slot[String(third ?? "form")] = issue.message;
      lines[second] = slot;
    } else if (typeof first === "string" && !fields[first]) {
      fields[first] = issue.message;
    }
  }
  return { errors: { fields, lines: lines.length > 0 ? lines : undefined } };
}
