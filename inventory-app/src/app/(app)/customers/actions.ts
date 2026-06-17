"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";

const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  mobile: z
    .string()
    .trim()
    .max(32)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  email: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .refine(
      (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  deliveryAddress: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
});

export type CustomerFormState = {
  errors?: Partial<Record<keyof z.infer<typeof customerSchema>, string>>;
  message?: string;
};

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "customers", action)) throw new Error("Forbidden");
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireCan("create");

  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const customer = await prisma.customer.create({ data: parsed.data });
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(
  id: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireCan("edit");

  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.customer.update({ where: { id }, data: parsed.data });
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { message: "Saved" };
}

export async function toggleCustomerActive(id: string): Promise<void> {
  await requireCan("edit");
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
  await prisma.customer.update({ where: { id }, data: { isActive: !customer.isActive } });
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
}

// Used by the sales flow to create a customer inline.
export async function quickCreateCustomer(input: {
  name: string;
  mobile?: string | null;
  email?: string | null;
  deliveryAddress?: string | null;
}): Promise<{ id: string; name: string }> {
  await requireCan("create");
  const parsed = customerSchema.safeParse({
    name: input.name,
    mobile: input.mobile ?? "",
    email: input.email ?? "",
    deliveryAddress: input.deliveryAddress ?? "",
    notes: "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid customer data");
  }
  const c = await prisma.customer.create({ data: parsed.data });
  return { id: c.id, name: c.name };
}

function fieldErrors(error: z.ZodError): CustomerFormState {
  const errors: CustomerFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof z.infer<typeof customerSchema> | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
