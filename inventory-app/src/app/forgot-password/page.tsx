import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Forgot password · Inventory & P&L" };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-50/40 via-white to-cyan-50/30 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
            Forgot password
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Enter your email and we&apos;ll send a reset link if it&apos;s registered.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
