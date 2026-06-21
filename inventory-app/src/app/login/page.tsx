import Link from "next/link";
import { signIn } from "@/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

export const metadata = {
  title: "Sign in · Inventory & P&L",
};

async function authenticate(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw err;
  }
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const justReset = params.reset === "1";

  const inputClass =
    "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-50/40 via-white to-cyan-50/30 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm" />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 dark:from-indigo-400 dark:via-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
            Inventory &amp; P&amp;L
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Sign in to continue</p>
        </div>

        {justReset && (
          <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            Your password has been reset. Sign in with your new password.
          </div>
        )}

        <form
          action={authenticate}
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
              defaultValue="admin@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs text-indigo-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          {hasError && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-neutral-500 mt-4 text-center">
          Default seeded admin: <code className="font-mono">admin@example.com</code> /{" "}
          <code className="font-mono">ChangeMe123!</code>
        </p>
      </div>
    </div>
  );
}
