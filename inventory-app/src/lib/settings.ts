import { prisma } from "@/lib/prisma";

export type VatSettings = {
  enabled: boolean;
  defaultRatePct: string; // string for Decimal-friendliness
  label: string;
  registrationNumber: string | null;
};

export type CompanyInfo = {
  name: string;
  tagline: string;
  phone: string;
  address: string;
  trn: string;
  logoUrl: string;
};

const defaults = {
  vat: {
    // UAE standard VAT is 5% — on by default; editable per sale and in Settings.
    enabled: true,
    defaultRatePct: "5",
    label: "VAT",
    registrationNumber: null,
  } as VatSettings,
  companyInfo: {
    name: "Your Company",
    tagline: "",
    phone: "",
    address: "",
    trn: "",
    logoUrl: "",
  } as CompanyInfo,
  defaultFxRate: "0.0445",
};

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function getVatSettings(): Promise<VatSettings> {
  const value = await readSetting<Partial<VatSettings>>("vat", defaults.vat);
  return {
    enabled: value.enabled ?? defaults.vat.enabled,
    defaultRatePct: value.defaultRatePct ?? defaults.vat.defaultRatePct,
    label: value.label ?? defaults.vat.label,
    registrationNumber: value.registrationNumber ?? null,
  };
}

export async function getCompanyInfo(): Promise<CompanyInfo> {
  const value = await readSetting<Partial<CompanyInfo>>("company_info", defaults.companyInfo);
  return {
    name: value.name ?? defaults.companyInfo.name,
    tagline: value.tagline ?? defaults.companyInfo.tagline,
    phone: value.phone ?? defaults.companyInfo.phone,
    address: value.address ?? defaults.companyInfo.address,
    trn: value.trn ?? defaults.companyInfo.trn,
    logoUrl: value.logoUrl ?? defaults.companyInfo.logoUrl,
  };
}

export async function getDefaultFxRate(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: "default_fx_rate" } });
  if (!row) return defaults.defaultFxRate;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === "string" ? parsed : defaults.defaultFxRate;
  } catch {
    return defaults.defaultFxRate;
  }
}
