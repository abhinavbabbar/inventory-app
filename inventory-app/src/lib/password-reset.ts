import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";

// How long a reset link stays valid.
export const RESET_TOKEN_TTL_MINUTES = 60;

// A raw token goes in the emailed link; only its SHA-256 hash is stored.
export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Absolute base URL for building the reset link. Prefers an explicit env var,
// otherwise derives it from the incoming request headers (correct per
// environment on Vercel — preview links point to preview, prod to prod).
export async function getBaseUrl(): Promise<string> {
  const configured =
    process.env.APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
