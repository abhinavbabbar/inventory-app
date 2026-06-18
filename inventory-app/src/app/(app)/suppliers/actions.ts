"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/domain";

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contactPerson: z.string().trim().max(200).optional().transform(emptyToNull),
  phone: z.string().trim().max(40).optional().transform(emptyToNull),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform(emptyToNull)
    .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  address: z.string().trim().max(500).optional().transform(emptyToNull),
  notes: z.string().trim().max(1000).optional().transform(emptyToNull),
});

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => !v.startsWith("-"), "Must be non-negative");

const paymentSchema = z.object({
  amountInr: decimalString.refine((v) => parseFloat(v) > 0, "Amount must be greater than zero"),
  paidAt: z.coerce.date(),
  method: z.enum(SUPPLIER_PAYMENT_METHODS).optional().nullable(),
  reference: z.string().trim().max(120).optional().transform(emptyToNull),
  notes: z.string().trim().max(500).optional().transform(emptyToNull),
});

function emptyToNull(v: string | undefined): string | null {
  return v == null || v.length === 0 ? null : v;
}

export type SupplierFormState = {
  errors?: Partial<Record<string, string>>;
  message?: string;
};

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "suppliers", action)) throw new Error("Forbidden");
}

export async function createSupplier(
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireCan("create");
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supplier = await prisma.supplier.create({ data: parsed.data });
  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplier.id}`);
}

export async function updateSupplier(
  id: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireCan("edit");
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.supplier.update({ where: { id }, data: parsed.data });
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { message: "Saved" };
}

export async function toggleSupplierActive(id: string): Promise<void> {
  await requireCan("edit");
  const s = await prisma.supplier.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
  await prisma.supplier.update({ where: { id }, data: { isActive: !s.isActive } });
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
}

export async function addSupplierPayment(
  supplierId: string,
  _prev: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  await requireCan("edit");
  const parsed = paymentSchema.safeParse({
    amountInr: formData.get("amountInr"),
    paidAt: formData.get("paidAt"),
    method: formData.get("method") || null,
    reference: formData.get("reference"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.supplierPayment.create({
    data: {
      supplierId,
      amountInr: new Prisma.Decimal(parsed.data.amountInr),
      paidAt: parsed.data.paidAt,
      method: parsed.data.method ?? null,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
    },
  });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
  return { message: "Payment recorded" };
}

export async function deleteSupplierPayment(
  supplierId: string,
  paymentId: string,
): Promise<void> {
  await requireCan("edit");
  await prisma.supplierPayment.delete({ where: { id: paymentId } });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/dashboard");
}

function fieldErrors(error: z.ZodError): SupplierFormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
