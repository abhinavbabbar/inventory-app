"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";

const itemSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  unit: z.string().trim().min(1).max(16).default("pc"),
  reorderThreshold: z.coerce.number().int().min(0).default(0),
  photoUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
});

export type ItemFormState = {
  errors?: Partial<Record<keyof z.infer<typeof itemSchema>, string>>;
  message?: string;
};

async function requireCan(action: "create" | "edit" | "delete") {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  if (!can(session.user, "items", action)) {
    throw new Error("Forbidden");
  }
  return session.user;
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  await requireCan("create");

  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fieldErrors(parsed.error);
  }

  const existing = await prisma.item.findUnique({ where: { sku: parsed.data.sku } });
  if (existing) {
    return { errors: { sku: "An item with this SKU already exists" } };
  }

  const item = await prisma.item.create({
    data: {
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      reorderThreshold: parsed.data.reorderThreshold,
      photoUrl: parsed.data.photoUrl,
    },
  });

  revalidatePath("/inventory");
  redirect(`/inventory/${item.id}`);
}

export async function updateItem(
  id: string,
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  await requireCan("edit");

  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fieldErrors(parsed.error);
  }

  // Ensure SKU uniqueness if changed.
  const conflict = await prisma.item.findFirst({
    where: { sku: parsed.data.sku, NOT: { id } },
    select: { id: true },
  });
  if (conflict) {
    return { errors: { sku: "Another item already has this SKU" } };
  }

  await prisma.item.update({
    where: { id },
    data: {
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      reorderThreshold: parsed.data.reorderThreshold,
      photoUrl: parsed.data.photoUrl,
    },
  });

  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
  return { message: "Saved" };
}

export async function toggleItemActive(id: string): Promise<void> {
  await requireCan("edit");
  const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
  await prisma.item.update({
    where: { id },
    data: { isActive: !item.isActive },
  });
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
}

function fieldErrors(error: z.ZodError): ItemFormState {
  const errors: ItemFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof z.infer<typeof itemSchema> | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
