"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { round2, sumDecimal } from "@/lib/money";
import { getCompanyInfo, getVatSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { ESTIMATE_STATUSES } from "@/lib/domain";
import type { EmailState } from "@/components/share-actions";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => !v.startsWith("-"), "Must be non-negative");

const lineSchema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  quantity: z.coerce.number().int().positive(),
  unitSalePriceAed: decimalString,
});

const estimateSchema = z
  .object({
    customerMode: z.enum(["existing", "new"]),
    customerId: z.string().trim().optional().transform((v) => (v == null || v.length === 0 ? null : v)),
    newCustomerName: z.string().trim().max(200).optional().transform((v) => (v == null || v.length === 0 ? null : v)),
    newCustomerMobile: z.string().trim().max(32).optional().transform((v) => (v == null || v.length === 0 ? null : v)),
    newCustomerEmail: z.string().trim().max(200).optional().transform((v) => (v == null || v.length === 0 ? null : v)),
    newCustomerAddress: z.string().trim().max(500).optional().transform((v) => (v == null || v.length === 0 ? null : v)),
    issuedAt: z.coerce.date(),
    validUntil: z.union([z.coerce.date(), z.literal(""), z.null()]).optional().transform((v) => (v instanceof Date ? v : null)),
    vatRatePct: decimalString,
    notes: z.string().trim().max(500).optional().transform((v) => v ?? null),
    lines: z.array(lineSchema).min(1, "At least one line is required"),
  })
  .refine(
    (v) => (v.customerMode === "existing" && v.customerId != null) || (v.customerMode === "new" && v.newCustomerName != null),
    { message: "Pick or create a customer", path: ["customerId"] },
  );

export type EstimateFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
    lines?: Array<Partial<Record<string, string>> | undefined>;
  };
};

function startOfDay(date: Date): Date {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ymd(date: Date): string {
  return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;
}
function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
function isUnique(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "estimates", action)) throw new Error("Forbidden");
}

export async function createEstimate(_prev: EstimateFormState, formData: FormData): Promise<EstimateFormState> {
  const session = await auth();
  if (!session?.user || !can(session.user, "estimates", "create")) return { errors: { form: "Forbidden" } };

  let linesJson: unknown;
  try {
    linesJson = JSON.parse(typeof formData.get("lines") === "string" ? (formData.get("lines") as string) : "[]");
  } catch {
    return { errors: { form: "Invalid line items" } };
  }

  const parsed = estimateSchema.safeParse({
    customerMode: formData.get("customerMode") ?? "existing",
    customerId: formData.get("customerId"),
    newCustomerName: formData.get("newCustomerName"),
    newCustomerMobile: formData.get("newCustomerMobile"),
    newCustomerEmail: formData.get("newCustomerEmail"),
    newCustomerAddress: formData.get("newCustomerAddress"),
    issuedAt: formData.get("issuedAt"),
    validUntil: formData.get("validUntil"),
    vatRatePct: formData.get("vatRatePct"),
    notes: formData.get("notes"),
    lines: linesJson,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const data = parsed.data;

  const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, isActive: true } });
  if (items.length !== itemIds.length || items.some((i) => !i.isActive)) {
    return { errors: { form: "One or more selected items are no longer available" } };
  }

  const vatRate = new Prisma.Decimal(data.vatRatePct);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const estimate = await prisma.$transaction(async (tx) => {
        let customerId: string;
        if (data.customerMode === "existing") {
          const c = await tx.customer.findUnique({ where: { id: data.customerId! } });
          if (!c) throw new Error("Selected customer no longer exists");
          customerId = c.id;
        } else {
          const c = await tx.customer.create({
            data: {
              name: data.newCustomerName!,
              mobile: data.newCustomerMobile,
              email: data.newCustomerEmail,
              deliveryAddress: data.newCustomerAddress,
            },
          });
          customerId = c.id;
        }

        const subtotal = sumDecimal(data.lines.map((l) => new Prisma.Decimal(l.unitSalePriceAed).mul(l.quantity)));
        const vatAmount = round2(subtotal.mul(vatRate).div(100));

        const day = startOfDay(data.issuedAt);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        const count = await tx.estimate.count({ where: { issuedAt: { gte: day, lt: next } } });
        const estimateNumber = `EST-${ymd(day)}-${(count + 1).toString().padStart(4, "0")}`;

        const created = await tx.estimate.create({
          data: {
            estimateNumber,
            customerId,
            status: "DRAFT",
            issuedAt: data.issuedAt,
            validUntil: data.validUntil,
            vatRatePct: vatRate,
            vatAmountAed: vatAmount,
            notes: data.notes,
          },
        });
        for (const l of data.lines) {
          await tx.estimateLine.create({
            data: { estimateId: created.id, itemId: l.itemId, quantity: l.quantity, unitSalePriceAed: new Prisma.Decimal(l.unitSalePriceAed) },
          });
        }
        return created;
      });

      revalidatePath("/estimates");
      revalidatePath("/customers");
      redirect(`/estimates/${estimate.id}`);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      if (isUnique(err) && attempt < 2) continue;
      throw err;
    }
  }
  return { errors: { form: "Failed to create estimate after multiple attempts" } };
}

export async function setEstimateStatus(id: string, status: string): Promise<void> {
  await requireCan("edit");
  if (!(ESTIMATE_STATUSES as readonly string[]).includes(status) || status === "CONVERTED") {
    throw new Error("Invalid status");
  }
  const est = await prisma.estimate.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (est.status === "CONVERTED") throw new Error("This estimate has already been converted");
  await prisma.estimate.update({ where: { id }, data: { status } });
  revalidatePath(`/estimates/${id}`);
  revalidatePath("/estimates");
}

export async function deleteEstimate(id: string): Promise<void> {
  await requireCan("delete");
  await prisma.estimate.delete({ where: { id } });
  revalidatePath("/estimates");
  redirect("/estimates");
}

// Convert an accepted estimate into an order (which later dispatches to an
// invoice). Copies customer, lines and VAT; the estimate is marked CONVERTED.
export async function convertEstimateToOrder(id: string): Promise<void> {
  await requireCan("create");

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!estimate) throw new Error("Estimate not found");
  if (estimate.status === "CONVERTED" || estimate.convertedOrderId) {
    throw new Error("This estimate has already been converted");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const subtotal = sumDecimal(estimate.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)));
        const vatAmount = estimate.vatAmountAed as Prisma.Decimal;
        const total = subtotal.add(vatAmount);

        const day = startOfDay(new Date());
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        const count = await tx.order.count({ where: { orderedAt: { gte: day, lt: next } } });
        const orderNumber = `ORD-${ymd(day)}-${(count + 1).toString().padStart(4, "0")}`;

        const created = await tx.order.create({
          data: {
            orderNumber,
            customerId: estimate.customerId,
            status: "IN_PROGRESS",
            orderedAt: new Date(),
            vatRatePct: estimate.vatRatePct,
            vatAmountAed: vatAmount,
            advancePct: new Prisma.Decimal(0),
            advanceAmountAed: new Prisma.Decimal(0),
            balanceAmountAed: total,
            notes: estimate.notes,
          },
        });
        for (const l of estimate.lines) {
          await tx.orderLine.create({
            data: { orderId: created.id, itemId: l.itemId, quantity: l.quantity, unitSalePriceAed: l.unitSalePriceAed },
          });
        }
        await tx.estimate.update({
          where: { id: estimate.id },
          data: { status: "CONVERTED", convertedOrderId: created.id, convertedAt: new Date() },
        });
        return created;
      });

      revalidatePath("/estimates");
      revalidatePath("/orders");
      revalidatePath("/dashboard");
      redirect(`/orders/${order.id}`);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      if (isUnique(err) && attempt < 2) continue;
      throw err;
    }
  }
  throw new Error("Failed to convert estimate after multiple attempts");
}

export async function emailEstimate(id: string, _prev: EmailState, _fd: FormData): Promise<EmailState> {
  const session = await auth();
  if (!session?.user || !can(session.user, "estimates", "view")) return { error: "Forbidden" };

  const estimate = await prisma.estimate.findUnique({
    where: { id },
    include: { customer: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!estimate) return { error: "Estimate not found" };
  if (!estimate.customer.email) return { error: "This customer has no email address on file." };
  if (!isEmailConfigured()) return { error: "Email isn't set up yet (add RESEND_API_KEY)." };

  const [company, vat] = await Promise.all([getCompanyInfo(), getVatSettings()]);
  const pdf = await renderInvoicePdf({
    docType: "QUOTATION",
    company,
    vat: { label: vat.label, registrationNumber: vat.registrationNumber },
    sale: {
      invoiceNumber: estimate.estimateNumber,
      soldAt: estimate.issuedAt,
      placeOfSale: estimate.validUntil ? `Valid until ${estimate.validUntil.toLocaleDateString("en-GB")}` : null,
      vatRatePct: estimate.vatRatePct,
      vatAmountAed: estimate.vatAmountAed,
      notes: estimate.notes,
    },
    customer: {
      name: estimate.customer.name,
      mobile: estimate.customer.mobile,
      email: estimate.customer.email,
      deliveryAddress: estimate.customer.deliveryAddress,
    },
    lines: estimate.lines.map((l) => ({
      description: l.item.name,
      sku: l.item.sku,
      quantity: l.quantity,
      unitSalePriceAed: l.unitSalePriceAed,
    })),
  });

  const brand = company.name || "Inventory & P&L";
  const result = await sendEmail({
    to: estimate.customer.email,
    subject: `Quotation ${estimate.estimateNumber} from ${brand}`,
    text: `Hi ${estimate.customer.name},\n\nPlease find quotation ${estimate.estimateNumber} attached.\n\nThank you,\n${brand}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937"><p>Hi ${estimate.customer.name},</p><p>Please find quotation <strong>${estimate.estimateNumber}</strong> attached.</p><p>Thank you,<br>${brand}</p></div>`,
    attachments: [{ filename: `${estimate.estimateNumber}.pdf`, content: pdf.toString("base64") }],
  });
  if (!result.delivered) return { error: `Couldn't send the email (${result.reason}).` };
  return { message: `Quotation emailed to ${estimate.customer.email}` };
}

function fieldErrors(error: z.ZodError): EstimateFormState {
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
