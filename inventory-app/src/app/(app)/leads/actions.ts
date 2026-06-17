"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { LEAD_STATUSES } from "@/lib/domain";

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  mobile: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v))
    .refine(
      (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  deliveryAddress: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  source: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  status: z.enum(LEAD_STATUSES).default("NEW"),
});

export type LeadFormState = {
  errors?: Partial<Record<keyof z.infer<typeof leadSchema>, string>>;
  message?: string;
};

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "leads", action)) throw new Error("Forbidden");
}

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  await requireCan("create");
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const lead = await prisma.lead.create({ data: parsed.data });
  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLead(
  id: string,
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  await requireCan("edit");
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.lead.update({ where: { id }, data: parsed.data });
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
  return { message: "Saved" };
}

export async function deleteLead(id: string): Promise<void> {
  await requireCan("delete");
  const lead = await prisma.lead.findUnique({ where: { id }, select: { convertedOrderId: true } });
  if (lead?.convertedOrderId) {
    throw new Error("Cannot delete a lead that has been converted to an order");
  }
  await prisma.lead.delete({ where: { id } });
  revalidatePath("/leads");
  redirect("/leads");
}

// Mark a lead "converted" without creating an order — used by the convert flow.
export async function markLeadConverted(leadId: string, orderId: string): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "CONVERTED", convertedAt: new Date(), convertedOrderId: orderId },
  });
}

function fieldErrors(error: z.ZodError): LeadFormState {
  const errors: LeadFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof z.infer<typeof leadSchema> | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
