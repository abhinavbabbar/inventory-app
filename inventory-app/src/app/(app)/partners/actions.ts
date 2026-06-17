"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { recomputePartnerTotal } from "@/lib/partners";

const decimalString = z
  .string()
  .trim()
  .refine((v) => v.length > 0, "Required")
  .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
  .refine((v) => !v.startsWith("-"), "Must be non-negative");

const newPartnerSchema = z
  .object({
    userMode: z.enum(["existing", "new"]),
    userId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v)),
    newUserName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v)),
    newUserEmail: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v))
      .refine(
        (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "Enter a valid email",
      ),
    newUserPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72)
      .optional()
      .nullable(),
    investmentAed: decimalString,
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v == null || v.length === 0 ? null : v)),
  })
  .refine(
    (v) => v.userMode === "new" || (v.userMode === "existing" && v.userId != null),
    { message: "Pick an existing user", path: ["userId"] },
  )
  .refine(
    (v) =>
      v.userMode === "existing" ||
      (v.userMode === "new" && v.newUserName != null && v.newUserEmail != null && v.newUserPassword != null),
    { message: "Name, email and password are required", path: ["newUserName"] },
  );

const updatePartnerSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
});

const contributionSchema = z.object({
  amountAed: decimalString.refine((v) => parseFloat(v) > 0, "Amount must be greater than zero"),
  contributedAt: z.coerce.date(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
});

export type PartnerFormState = {
  errors?: {
    form?: string;
    fields?: Partial<Record<string, string>>;
  };
  message?: string;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "partners", "create") || session.user.role !== "ADMIN") {
    throw new Error("Forbidden — admin only");
  }
}

export async function createPartner(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  await requireAdmin();

  const parsed = newPartnerSchema.safeParse({
    userMode: formData.get("userMode") ?? "existing",
    userId: formData.get("userId"),
    newUserName: formData.get("newUserName"),
    newUserEmail: formData.get("newUserEmail"),
    newUserPassword: formData.get("newUserPassword") || null,
    investmentAed: formData.get("investmentAed"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const data = parsed.data;

  try {
    const partner = await prisma.$transaction(async (tx) => {
      let userId: string;
      if (data.userMode === "existing") {
        const user = await tx.user.findUnique({ where: { id: data.userId! } });
        if (!user) throw new FormError("Selected user no longer exists", "userId");
        if (user.role !== "PARTNER") {
          // Promote to PARTNER if currently a different role — admins can do this.
          await tx.user.update({ where: { id: user.id }, data: { role: "PARTNER" } });
        }
        const existing = await tx.partner.findUnique({ where: { userId: user.id } });
        if (existing) throw new FormError("That user already has a partner record", "userId");
        userId = user.id;
      } else {
        const emailTaken = await tx.user.findUnique({ where: { email: data.newUserEmail! } });
        if (emailTaken) throw new FormError("That email is already in use", "newUserEmail");
        const passwordHash = await bcrypt.hash(data.newUserPassword!, 10);
        const user = await tx.user.create({
          data: {
            name: data.newUserName!,
            email: data.newUserEmail!,
            passwordHash,
            role: "PARTNER",
          },
        });
        userId = user.id;
      }

      const amount = new Prisma.Decimal(data.investmentAed);
      const partner = await tx.partner.create({
        data: {
          userId,
          investmentAed: amount,
          notes: data.notes,
        },
      });
      // Seed the ledger with the opening contribution so history is complete.
      await tx.partnerInvestment.create({
        data: {
          partnerId: partner.id,
          amountAed: amount,
          contributedAt: new Date(),
          notes: "Initial investment",
        },
      });
      return partner;
    });

    revalidatePath("/partners");
    revalidatePath("/dashboard");
    redirect(`/partners/${partner.id}`);
  } catch (err) {
    if (err instanceof FormError) {
      return { errors: { fields: { [err.field]: err.message } } };
    }
    throw err;
  }
}

export async function updatePartner(
  id: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  await requireAdmin();
  const parsed = updatePartnerSchema.safeParse({
    notes: formData.get("notes"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.partner.update({
    where: { id },
    data: { notes: parsed.data.notes },
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
  return { message: "Saved" };
}

// Add a new dated capital contribution (top-up) to an existing partner.
export async function addContribution(
  partnerId: string,
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  await requireAdmin();
  const parsed = contributionSchema.safeParse({
    amountAed: formData.get("amountAed"),
    contributedAt: formData.get("contributedAt"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  await prisma.$transaction(async (tx) => {
    await tx.partnerInvestment.create({
      data: {
        partnerId,
        amountAed: new Prisma.Decimal(parsed.data.amountAed),
        contributedAt: parsed.data.contributedAt,
        notes: parsed.data.notes,
      },
    });
    await recomputePartnerTotal(tx, partnerId);
  });

  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/dashboard");
  return { message: "Contribution added" };
}

export async function deleteContribution(
  partnerId: string,
  contributionId: string,
): Promise<void> {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.partnerInvestment.delete({ where: { id: contributionId } });
    await recomputePartnerTotal(tx, partnerId);
  });
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/dashboard");
}

export async function removePartner(id: string): Promise<void> {
  await requireAdmin();
  // Removes the Partner row — the underlying User row is kept (they can still log in).
  await prisma.partner.delete({ where: { id } });
  revalidatePath("/partners");
  revalidatePath("/dashboard");
  redirect("/partners");
}

class FormError extends Error {
  constructor(message: string, public field: string) {
    super(message);
  }
}

function fieldErrors(error: z.ZodError): PartnerFormState {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
  }
  return { errors: { fields } };
}
