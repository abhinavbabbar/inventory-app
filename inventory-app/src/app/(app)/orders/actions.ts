"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { d, round2, sumDecimal, formatAed } from "@/lib/money";
import { getCompanyInfo } from "@/lib/settings";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import type { EmailState } from "@/components/share-actions";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number");

const decimalStringNonNegative = decimalString.refine((v) => !v.startsWith("-"), "Must be non-negative");

const orderLineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().int().positive(),
  unitSalePriceAed: decimalStringNonNegative,
});

const orderSchema = z
  .object({
    customerMode: z.enum(["existing", "new"]),
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
    leadId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v)),
    orderedAt: z.coerce.date(),
    expectedDispatchAt: z
      .union([z.coerce.date(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v instanceof Date ? v : null)),
    vatRatePct: decimalStringNonNegative,
    advancePct: decimalStringNonNegative,
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v ?? null),
    lines: z.array(orderLineSchema).min(1, "At least one line is required"),
  })
  .refine(
    (v) =>
      (v.customerMode === "existing" && v.customerId != null) ||
      (v.customerMode === "new" && v.newCustomerName != null),
    { message: "Pick or create a customer", path: ["customerId"] },
  )
  .refine(
    (v) => Number(v.advancePct) <= 100,
    { message: "Advance cannot exceed 100%", path: ["advancePct"] },
  );

export type OrderFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
    lines?: Array<Partial<Record<string, string>> | undefined>;
  };
};

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
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function startOfDay(date: Date): Date {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatYYYYMMDD(date: Date): string {
  return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
}

export async function createOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const session = await auth();
  if (!session?.user) return { errors: { form: "Unauthorized" } };
  if (!can(session.user, "orders", "create")) return { errors: { form: "Forbidden" } };

  const linesRaw = formData.get("lines");
  let linesJson: unknown;
  try {
    linesJson = JSON.parse(typeof linesRaw === "string" ? linesRaw : "[]");
  } catch {
    return { errors: { form: "Invalid line items payload" } };
  }

  const parsed = orderSchema.safeParse({
    customerMode: formData.get("customerMode") ?? "existing",
    customerId: formData.get("customerId"),
    newCustomerName: formData.get("newCustomerName"),
    newCustomerMobile: formData.get("newCustomerMobile"),
    newCustomerEmail: formData.get("newCustomerEmail"),
    newCustomerAddress: formData.get("newCustomerAddress"),
    leadId: formData.get("leadId"),
    orderedAt: formData.get("orderedAt"),
    expectedDispatchAt: formData.get("expectedDispatchAt"),
    vatRatePct: formData.get("vatRatePct"),
    advancePct: formData.get("advancePct"),
    notes: formData.get("notes"),
    lines: linesJson,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const data = parsed.data;

  // Verify items
  const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, isActive: true, name: true },
  });
  if (items.length !== itemIds.length || items.some((i) => !i.isActive)) {
    return { errors: { form: "One or more selected items are no longer available" } };
  }

  const vatRate = new Prisma.Decimal(data.vatRatePct);
  const advancePct = new Prisma.Decimal(data.advancePct);

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        // Resolve customer
        let customerId: string;
        if (data.customerMode === "existing") {
          const customer = await tx.customer.findUnique({ where: { id: data.customerId! } });
          if (!customer) throw new Error("Selected customer no longer exists");
          customerId = customer.id;
        } else {
          const created = await tx.customer.create({
            data: {
              name: data.newCustomerName!,
              mobile: data.newCustomerMobile,
              email: data.newCustomerEmail,
              deliveryAddress: data.newCustomerAddress,
            },
          });
          customerId = created.id;
        }

        // Compute totals
        const subtotal = sumDecimal(
          data.lines.map((l) =>
            new Prisma.Decimal(l.unitSalePriceAed).mul(l.quantity),
          ),
        );
        const vatAmount = round2(subtotal.mul(vatRate).div(100));
        const total = subtotal.add(vatAmount);
        const advanceAmount = round2(total.mul(advancePct).div(100));
        const balanceAmount = total.sub(advanceAmount);

        // Generate order number
        const today = startOfDay(data.orderedAt);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dailyCount = await tx.order.count({
          where: { orderedAt: { gte: today, lt: tomorrow } },
        });
        const orderNumber = `ORD-${formatYYYYMMDD(today)}-${(dailyCount + 1).toString().padStart(4, "0")}`;

        const created = await tx.order.create({
          data: {
            orderNumber,
            customerId,
            status: "IN_PROGRESS",
            orderedAt: data.orderedAt,
            expectedDispatchAt: data.expectedDispatchAt,
            vatRatePct: vatRate,
            vatAmountAed: vatAmount,
            advancePct,
            advanceAmountAed: advanceAmount,
            balanceAmountAed: balanceAmount,
            notes: data.notes,
          },
        });

        for (const line of data.lines) {
          await tx.orderLine.create({
            data: {
              orderId: created.id,
              itemId: line.itemId,
              quantity: line.quantity,
              unitSalePriceAed: new Prisma.Decimal(line.unitSalePriceAed),
            },
          });
        }

        // If created from a lead, mark it converted
        if (data.leadId) {
          await tx.lead.update({
            where: { id: data.leadId },
            data: {
              status: "CONVERTED",
              convertedAt: new Date(),
              convertedOrderId: created.id,
            },
          });
        }

        return created;
      });

      revalidatePath("/orders");
      revalidatePath("/leads");
      revalidatePath("/customers");
      revalidatePath("/dashboard");
      redirect(`/orders/${order.id}`);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      if (isUniqueConstraintError(err) && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }
  return { errors: { form: "Failed to create order after multiple attempts" } };
}

async function requireCanEdit() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "orders", "edit")) throw new Error("Forbidden");
}

// --- Order payments (multi-payer ledger) ------------------------------------

const orderPaymentSchema = z.object({
  payerName: z.string().trim().min(1, "Enter who paid").max(120),
  amountAed: decimalStringNonNegative.refine((v) => parseFloat(v) > 0, "Amount must be greater than zero"),
  paidAt: z.coerce.date(), // operator-set — back-dated payments allowed
  method: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  notes: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
});

export type OrderPaymentState = { message?: string; error?: string };

// Recompute the denormalized advancePaidAt / balancePaidAt flags from the
// payment ledger, so the dashboard, orders list and analytics stay correct.
// A flag is set to the date the cumulative total (oldest-first) crosses the
// advance / full-total threshold — which respects back-dated payments.
async function recomputeOrderPaymentStatus(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { advanceAmountAed: true, balanceAmountAed: true },
  });
  const advance = order.advanceAmountAed as Prisma.Decimal;
  const total = advance.add(order.balanceAmountAed as Prisma.Decimal);

  const payments = await tx.orderPayment.findMany({
    where: { orderId },
    orderBy: { paidAt: "asc" },
    select: { amountAed: true, paidAt: true },
  });

  let cum = new Prisma.Decimal(0);
  let advancePaidAt: Date | null = null;
  let balancePaidAt: Date | null = null;
  for (const p of payments) {
    cum = cum.add(p.amountAed as Prisma.Decimal);
    if (advancePaidAt == null && advance.greaterThan(0) && cum.greaterThanOrEqualTo(advance)) {
      advancePaidAt = p.paidAt;
    }
    if (balancePaidAt == null && total.greaterThan(0) && cum.greaterThanOrEqualTo(total)) {
      balancePaidAt = p.paidAt;
    }
  }

  await tx.order.update({ where: { id: orderId }, data: { advancePaidAt, balancePaidAt } });
}

export async function addOrderPayment(
  orderId: string,
  _prev: OrderPaymentState,
  formData: FormData,
): Promise<OrderPaymentState> {
  await requireCanEdit();
  const parsed = orderPaymentSchema.safeParse({
    payerName: formData.get("payerName"),
    amountAed: formData.get("amountAed"),
    paidAt: formData.get("paidAt"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return { error: "Order not found" };
  if (order.status === "CANCELLED") return { error: "Can't record payments on a cancelled order" };

  const { payerName, amountAed, paidAt, method, notes } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.create({
      data: { orderId, payerName, amountAed: new Prisma.Decimal(amountAed), paidAt, method, notes },
    });
    await recomputeOrderPaymentStatus(tx, orderId);
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { message: "Payment recorded" };
}

export async function deleteOrderPayment(orderId: string, paymentId: string): Promise<void> {
  await requireCanEdit();
  await prisma.$transaction(async (tx) => {
    await tx.orderPayment.delete({ where: { id: paymentId } });
    await recomputeOrderPaymentStatus(tx, orderId);
  });
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

// Email the customer a reminder of the outstanding balance on an order.
export async function sendOrderReminderEmail(
  orderId: string,
  _prev: EmailState,
  _formData: FormData,
): Promise<EmailState> {
  await requireCanEdit();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, payments: { select: { amountAed: true } } },
  });
  if (!order) return { error: "Order not found" };

  const total = (order.advanceAmountAed as Prisma.Decimal).add(order.balanceAmountAed as Prisma.Decimal);
  const paid = sumDecimal(order.payments.map((p) => p.amountAed as Prisma.Decimal));
  const remaining = total.sub(paid);
  if (!remaining.greaterThan(0)) return { error: "Nothing is outstanding on this order." };
  if (!order.customer.email) return { error: "This customer has no email address on file." };
  if (!isEmailConfigured()) return { error: "Email isn't set up yet (add RESEND_API_KEY)." };

  const brand = (await getCompanyInfo()).name || "Inventory & P&L";
  const result = await sendEmail({
    to: order.customer.email,
    subject: `Payment reminder · order ${order.orderNumber}`,
    text: `Hi ${order.customer.name},\n\nThis is a friendly reminder that order ${order.orderNumber} has an outstanding balance of ${formatAed(remaining)} (of ${formatAed(total)} total).\n\nThank you,\n${brand}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
      <p>Hi ${order.customer.name},</p>
      <p>This is a friendly reminder that order <strong>${order.orderNumber}</strong> has an outstanding balance of
      <strong>${formatAed(remaining)}</strong> (of ${formatAed(total)} total).</p>
      <p>Thank you,<br>${brand}</p>
    </div>`,
  });
  if (!result.delivered) return { error: `Couldn't send the email (${result.reason}).` };
  return { message: `Reminder emailed to ${order.customer.email}` };
}

export async function cancelOrder(id: string): Promise<void> {
  await requireCanEdit();
  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });
  if (order.status !== "IN_PROGRESS") {
    throw new Error("Only in-progress orders can be cancelled");
  }
  await prisma.order.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

export async function dispatchOrder(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "orders", "edit")) throw new Error("Forbidden");

  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: { include: { item: { select: { name: true } } } }, customer: true },
  });
  if (!order) throw new Error("Order not found");
  if (order.status !== "IN_PROGRESS") {
    throw new Error("Order is not in progress");
  }

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        // Pre-flight: check stock availability per line
        for (const line of order.lines) {
          const available = await tx.stockMovement.aggregate({
            where: { itemId: line.itemId },
            _sum: { quantity: true },
          });
          const have = available._sum.quantity ?? 0;
          if (have < line.quantity) {
            throw new InsufficientStockError(
              `Not enough stock for ${line.item.name} — need ${line.quantity}, have ${have}`,
            );
          }
        }

        // Generate invoice number for the new Sale
        const now = new Date();
        const today = startOfDay(now);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dailyCount = await tx.sale.count({
          where: { soldAt: { gte: today, lt: tomorrow } },
        });
        const invoiceNumber = `INV-${formatYYYYMMDD(today)}-${(dailyCount + 1).toString().padStart(4, "0")}`;

        // Create the Sale row
        const sale = await tx.sale.create({
          data: {
            invoiceNumber,
            customerId: order.customerId,
            orderId: order.id,
            soldAt: now,
            vatRatePct: order.vatRatePct,
            vatAmountAed: order.vatAmountAed,
            notes: order.notes,
          },
        });

        // Per line: FIFO consumption + SaleLine + StockMovements
        for (const line of order.lines) {
          const movements = await tx.stockMovement.findMany({
            where: { itemId: line.itemId },
            orderBy: { createdAt: "asc" },
            select: { quantity: true, unitCostAed: true, shipmentLineId: true },
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
            throw new InsufficientStockError(
              `Stock changed mid-dispatch for ${line.item.name} — short by ${needed}`,
            );
          }

          const totalCost = sumDecimal(slices.map((s) => s.unitCost.mul(s.quantity)));
          const avgUnitCost = totalCost.div(line.quantity);

          const saleLine = await tx.saleLine.create({
            data: {
              saleId: sale.id,
              itemId: line.itemId,
              quantity: line.quantity,
              unitSalePriceAed: line.unitSalePriceAed,
              unitCostAedSnapshot: avgUnitCost,
            },
          });

          for (const slice of slices) {
            await tx.stockMovement.create({
              data: {
                itemId: line.itemId,
                quantity: -slice.quantity,
                type: "SALE_OUT",
                saleLineId: saleLine.id,
                shipmentLineId: slice.shipmentLineId,
                unitCostAed: slice.unitCost,
              },
            });
          }
        }

        // Mark order dispatched
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "DISPATCHED",
            dispatchedAt: now,
            saleId: sale.id,
          },
        });
      });

      revalidatePath(`/orders/${id}`);
      revalidatePath("/orders");
      revalidatePath("/sales");
      revalidatePath("/inventory");
      revalidatePath("/dashboard");
      return;
    } catch (err) {
      if (err instanceof InsufficientStockError) throw err;
      if (isUniqueConstraintError(err) && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }
  throw new Error("Failed to dispatch order after multiple attempts");
}

// Used when updating order metadata (notes, expected dispatch date) — basic edits.
const orderEditSchema = z.object({
  expectedDispatchAt: z
    .union([z.coerce.date(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v instanceof Date ? v : null)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v ?? null),
});

export async function updateOrderMeta(
  id: string,
  _prev: { message?: string; error?: string },
  formData: FormData,
): Promise<{ message?: string; error?: string }> {
  await requireCanEdit();
  const parsed = orderEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  });
  if (order.status !== "IN_PROGRESS") {
    return { error: "Only in-progress orders can be edited" };
  }

  await prisma.order.update({
    where: { id },
    data: parsed.data,
  });
  revalidatePath(`/orders/${id}`);
  return { message: "Saved" };
}

function fieldErrors(error: z.ZodError): OrderFormState {
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
