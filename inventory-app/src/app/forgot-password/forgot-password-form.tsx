"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, type ForgotState } from "./actions";

const inputClass =
  "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    requestPasswordReset,
    {},
  );

  if (state.status === "sent") {
    return (
      <div className="space-y-4 bg-white dark:bg-neutral-900 p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          A password reset link has been sent to <strong>{state.email}</strong>. It expires in 60 minutes.
        </div>
        <p className="text-xs text-neutral-500">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link href="/forgot-password" className="text-indigo-600 hover:underline">try again</Link>.
        </p>
        <Link href="/login" className="text-sm text-indigo-600 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 bg-white dark:bg-neutral-900 p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm"
    >
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      {state.status === "not_found" && (
        <p className="text-sm text-red-600">
          No account is registered with <strong>{state.email}</strong>.
        </p>
      )}
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Send reset link"}
      </button>

      <div className="text-center">
        <Link href="/login" className="text-sm text-indigo-600 hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </form>
  );
}
