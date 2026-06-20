"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { OPEX_CATEGORIES } from "@/lib/domain";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => !v.startsWith("-"), "Must be non-negative");

const opexSchema = z.object({
  category: z.enum(OPEX_CATEGORIES),
  // Free-text label used only when category === "OTHER".
  categoryOther: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  amountAed: decimalString,
  incurredAt: z.coerce.date(),
  paidByPartnerId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
});

// Resolve the value stored in OpexEntry.category: a custom label when the user
// picked "Other" and typed one, otherwise the enum value.
function opexDataFrom(d: z.infer<typeof opexSchema>) {
  const category = d.category === "OTHER" && d.categoryOther ? d.categoryOther : d.category;
  return {
    category,
    amountAed: d.amountAed,
    incurredAt: d.incurredAt,
    paidByPartnerId: d.paidByPartnerId,
    notes: d.notes,
  };
}

export type OpexFormState = {
  errors?: Partial<Record<keyof z.infer<typeof opexSchema>, string>>;
  message?: string;
};

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "opex", action)) throw new Error("Forbidden");
}

function revalidateAll() {
  revalidatePath("/opex");
  revalidatePath("/dashboard");
  // Partner detail shows fronted costs (reimbursable), so refresh it too.
  revalidatePath("/partners");
}

export async function createOpex(
  _prev: OpexFormState,
  formData: FormData,
): Promise<OpexFormState> {
  await requireCan("create");
  const parsed = opexSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.opexEntry.create({ data: opexDataFrom(parsed.data) });
  revalidateAll();
  redirect("/opex");
}

export async function updateOpex(
  id: string,
  _prev: OpexFormState,
  formData: FormData,
): Promise<OpexFormState> {
  await requireCan("edit");
  const parsed = opexSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.opexEntry.update({ where: { id }, data: opexDataFrom(parsed.data) });
  revalidateAll();
  return { message: "Saved" };
}

export async function deleteOpex(id: string): Promise<void> {
  await requireCan("delete");
  await prisma.opexEntry.delete({ where: { id } });
  revalidateAll();
  redirect("/opex");
}

function fieldErrors(error: z.ZodError): OpexFormState {
  const errors: OpexFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof z.infer<typeof opexSchema> | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
