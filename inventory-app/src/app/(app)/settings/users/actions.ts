"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { ROLES } from "@/lib/domain";

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(200)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(ROLES),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  role: z.enum(ROLES),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export type UserFormState = {
  errors?: Partial<Record<string, string>>;
  message?: string;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "users", "edit") || session.user.role !== "ADMIN") {
    throw new Error("Forbidden — admin only");
  }
  return session.user;
}

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { errors: { email: "That email is already in use" } };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
    },
  });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function updateUser(
  id: string,
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const me = await requireAdmin();
  const parsed = updateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  // Guard: can't demote yourself out of ADMIN — would lock the org out.
  if (id === me.id && parsed.data.role !== "ADMIN") {
    return { errors: { role: "You can't change your own role away from ADMIN" } };
  }

  await prisma.user.update({
    where: { id },
    data: { name: parsed.data.name, role: parsed.data.role },
  });
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${id}`);
  return { message: "Saved" };
}

export async function resetUserPassword(
  id: string,
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return { message: "Password updated" };
}

export async function toggleUserActive(id: string): Promise<void> {
  const me = await requireAdmin();
  if (id === me.id) {
    throw new Error("You can't deactivate your own account");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { isActive: true } });
  await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${id}`);
}

function fieldErrors(error: z.ZodError): UserFormState {
  const errors: UserFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
