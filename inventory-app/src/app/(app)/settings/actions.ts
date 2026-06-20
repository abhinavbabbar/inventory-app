"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { refreshCbuaeRate } from "@/lib/fx";

const companyInfoSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  tagline: z.string().trim().max(120).optional().transform((v) => v ?? ""),
  address: z.string().trim().max(500).optional().transform((v) => v ?? ""),
  trn: z.string().trim().max(64).optional().transform((v) => v ?? ""),
  // External URL or an uploaded logo stored as a data URL (can be large).
  logoUrl: z.string().trim().max(1_500_000).optional().transform((v) => v ?? ""),
});

const vatSchema = z.object({
  enabled: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  defaultRatePct: z
    .string()
    .trim()
    .refine((v) => v.length > 0, "Required")
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
    .refine((v) => !v.startsWith("-"), "Must be non-negative"),
  label: z.string().trim().min(1).max(32),
  registrationNumber: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? null : v)),
});

const fxSchema = z.object({
  defaultFxRate: z
    .string()
    .trim()
    .refine((v) => v.length > 0, "Required")
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), "Must be a number")
    .refine((v) => !v.startsWith("-"), "Must be non-negative"),
});

export type SettingsFormState = {
  errors?: Partial<Record<string, string>>;
  message?: string;
};

async function requireSettingsEdit() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (!can(session.user, "settings", "edit")) throw new Error("Forbidden");
}

async function upsertSetting(key: string, value: unknown) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { key, value: JSON.stringify(value) },
  });
}

export async function saveCompanyInfo(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSettingsEdit();
  const parsed = companyInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  await upsertSetting("company_info", parsed.data);
  revalidatePath("/settings");
  return { message: "Company info saved" };
}

export async function saveVatSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSettingsEdit();
  const parsed = vatSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  await upsertSetting("vat", parsed.data);
  revalidatePath("/settings");
  revalidatePath("/sales/new");
  return { message: "VAT settings saved" };
}

export async function saveFxRate(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  await requireSettingsEdit();
  const parsed = fxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  await upsertSetting("default_fx_rate", parsed.data.defaultFxRate);
  revalidatePath("/settings");
  revalidatePath("/shipments/new");
  return { message: "FX rate saved" };
}

// Force a fresh pull of the UAE Central Bank rate and re-render the pages that
// surface it. Does not change the saved default — only refreshes the live read.
export async function refreshLiveFxRate(): Promise<void> {
  await requireSettingsEdit();
  await refreshCbuaeRate();
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

// Pull the latest CBUAE rate and persist it as the app's default FX rate
// (INR→AED), which pre-fills new shipments and drives INR equivalents.
export async function applyLiveFxRateAsDefault(): Promise<void> {
  await requireSettingsEdit();
  const live = await refreshCbuaeRate();
  await upsertSetting("default_fx_rate", live.inrToAed.toString());
  revalidatePath("/settings");
  revalidatePath("/shipments/new");
  revalidatePath("/dashboard");
}

function fieldErrors(error: z.ZodError): SettingsFormState {
  const errors: SettingsFormState["errors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
