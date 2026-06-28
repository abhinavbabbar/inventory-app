"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { getCompanyInfo } from "@/lib/settings";
import { renderPoPdf } from "@/lib/po-pdf";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { PO_STATUSES } from "@/lib/domain";
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
  unitPurchasePriceInr: decimalString,
});

const poSchema = z.object({
  supplierId: z.string().min(1, "Pick a supplier"),
  orderedAt: z.coerce.date(),
  expectedAt: z.union([z.coerce.date(), z.literal(""), z.null()]).optional().transform((v) => (v instanceof Date ? v : null)),
  notes: z.string().trim().max(500).optional().transform((v) => v ?? null),
  lines: z.array(lineSchema).min(1, "At least one line is required"),
});

export type PoFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
    lines?: Array<Partial<Record<string, string>> | undefined>;
  };
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, "0")}${d.getDate().toString().padStart(2, "0")}`;
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
  if (!can(session.user, "purchaseOrders", action)) throw new Error("Forbidden");
}

export async function createPurchaseOrder(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const session = await auth();
  if (!session?.user || !can(session.user, "purchaseOrders", "create")) return { errors: { form: "Forbidden" } };

  let linesJson: unknown;
  try {
    linesJson = JSON.parse(typeof formData.get("lines") === "string" ? (formData.get("lines") as string) : "[]");
  } catch {
    return { errors: { form: "Invalid line items" } };
  }

  const parsed = poSchema.safeParse({
    supplierId: formData.get("supplierId"),
    orderedAt: formData.get("orderedAt"),
    expectedAt: formData.get("expectedAt"),
    notes: formData.get("notes"),
    lines: linesJson,
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const data = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId }, select: { id: true } });
  if (!supplier) return { errors: { fields: { supplierId: "Supplier no longer exists" } } };

  const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, isActive: true } });
  if (items.length !== itemIds.length || items.some((i) => !i.isActive)) {
    return { errors: { form: "One or more selected items are no longer available" } };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const po = await prisma.$transaction(async (tx) => {
        const day = startOfDay(data.orderedAt);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        const count = await tx.purchaseOrder.count({ where: { orderedAt: { gte: day, lt: next } } });
        const poNumber = `PO-${ymd(day)}-${(count + 1).toString().padStart(4, "0")}`;

        const created = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId: data.supplierId,
            status: "DRAFT",
            orderedAt: data.orderedAt,
            expectedAt: data.expectedAt,
            notes: data.notes,
          },
        });
        for (const l of data.lines) {
          await tx.purchaseOrderLine.create({
            data: { purchaseOrderId: created.id, itemId: l.itemId, quantity: l.quantity, unitPurchasePriceInr: new Prisma.Decimal(l.unitPurchasePriceInr) },
          });
        }
        return created;
      });

      revalidatePath("/purchase-orders");
      redirect(`/purchase-orders/${po.id}`);
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      if (isUnique(err) && attempt < 2) continue;
      throw err;
    }
  }
  return { errors: { form: "Failed to create purchase order after multiple attempts" } };
}

export async function setPoStatus(id: string, status: string): Promise<void> {
  await requireCan("edit");
  if (!(PO_STATUSES as readonly string[]).includes(status) || status === "RECEIVED") {
    throw new Error("Invalid status");
  }
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (po.status === "RECEIVED") throw new Error("This PO has already been received");
  await prisma.purchaseOrder.update({ where: { id }, data: { status } });
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await requireCan("delete");
  await prisma.purchaseOrder.delete({ where: { id } });
  revalidatePath("/purchase-orders");
  redirect("/purchase-orders");
}

export async function emailPurchaseOrder(id: string, _prev: EmailState, _fd: FormData): Promise<EmailState> {
  const session = await auth();
  if (!session?.user || !can(session.user, "purchaseOrders", "view")) return { error: "Forbidden" };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { supplier: true, lines: { include: { item: true }, orderBy: { id: "asc" } } },
  });
  if (!po) return { error: "Purchase order not found" };
  if (!po.supplier.email) return { error: "This supplier has no email address on file." };
  if (!isEmailConfigured()) return { error: "Email isn't set up yet (add RESEND_API_KEY)." };

  const company = await getCompanyInfo();
  const pdf = await renderPoPdf({
    company,
    po: { poNumber: po.poNumber, orderedAt: po.orderedAt, expectedAt: po.expectedAt, notes: po.notes },
    supplier: { name: po.supplier.name, phone: po.supplier.phone, email: po.supplier.email, address: po.supplier.address },
    lines: po.lines.map((l) => ({ description: l.item.name, sku: l.item.sku, quantity: l.quantity, unitPurchasePriceInr: l.unitPurchasePriceInr })),
  });

  const brand = company.name || "Inventory & P&L";
  const result = await sendEmail({
    to: po.supplier.email,
    subject: `Purchase order ${po.poNumber} from ${brand}`,
    text: `Hello,\n\nPlease find purchase order ${po.poNumber} attached.\n\nRegards,\n${brand}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937"><p>Hello,</p><p>Please find purchase order <strong>${po.poNumber}</strong> attached.</p><p>Regards,<br>${brand}</p></div>`,
    attachments: [{ filename: `${po.poNumber}.pdf`, content: pdf.toString("base64") }],
  });
  if (!result.delivered) return { error: `Couldn't send the email (${result.reason}).` };
  return { message: `PO emailed to ${po.supplier.email}` };
}

function fieldErrors(error: z.ZodError): PoFormState {
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
