import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Reset password · Inventory & P&L" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-100/60 via-fuchsia-50/40 to-cyan-100/50 dark:from-indigo-950/40 dark:via-neutral-950 dark:to-cyan-950/30">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
            Set a new password
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Choose a new password for your account.</p>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="space-y-4 bg-white dark:bg-neutral-900 p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <p className="text-sm text-red-600">
              This reset link is missing or invalid. Please request a new one.
            </p>
            <Link href="/forgot-password" className="text-sm text-indigo-600 hover:underline">
              Request a reset link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
