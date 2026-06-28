"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCompanyInfo } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import {
  generateResetToken,
  getBaseUrl,
  RESET_TOKEN_TTL_MINUTES,
} from "@/lib/password-reset";

export type ForgotState = {
  status?: "sent" | "not_found" | "error";
  email?: string;
  message?: string;
};

const schema = z.object({ email: z.string().trim().email() });

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: "Please enter a valid email address." };
  }
  const email = parsed.data.email;

  // Case-insensitive lookup so capitalisation doesn't matter.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // Only registered, active accounts get a link — otherwise report not found.
  if (!user || !user.isActive) {
    return { status: "not_found", email };
  }

  const { raw, hash } = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

  // Invalidate any outstanding tokens, then issue a fresh one.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    }),
  ]);

  const baseUrl = await getBaseUrl();
  const link = `${baseUrl}/reset-password?token=${raw}`;
  const brand = (await getCompanyInfo()).name || "BookWise";

  const result = await sendEmail({
    to: user.email,
    subject: `Reset your ${brand} password`,
    text: `Hi ${user.name},

We received a request to reset your ${brand} password. Open this link to choose a new one (it expires in ${RESET_TOKEN_TTL_MINUTES} minutes):

${link}

If you didn't request this, you can ignore this email — your password won't change.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
        <h2 style="margin:0 0 8px">Reset your password</h2>
        <p style="color:#4b5563">Hi ${user.name}, we received a request to reset your <strong>${brand}</strong> password.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">Choose a new password</a>
        </p>
        <p style="color:#6b7280;font-size:13px">This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If you didn't request it, you can safely ignore this email.</p>
        <p style="color:#9ca3af;font-size:12px;word-break:break-all">${link}</p>
      </div>`,
  });

  // When email isn't configured, surface the link in server logs so the flow
  // is still testable. (Never returned to the browser.)
  if (!result.delivered) {
    console.warn(`[forgot-password] Email not delivered (${result.reason}). Reset link for ${user.email}: ${link}`);
  }

  return { status: "sent", email: user.email };
}
