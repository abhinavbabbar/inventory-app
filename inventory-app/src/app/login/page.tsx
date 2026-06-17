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
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Inventory & P&L</h1>
          <p className="text-sm text-neutral-500 mt-1">Sign in to continue</p>
        </div>

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
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100"
            />
          </div>
          {hasError && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <button
            type="submit"
            className="w-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-md py-2 text-sm font-medium hover:opacity-90"
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
