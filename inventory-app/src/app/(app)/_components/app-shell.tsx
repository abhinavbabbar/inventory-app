"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "./sidebar";

type Props = {
  role: string;
  permissions: string | null;
  userName: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
};

export function AppShell({ role, permissions, userName, signOutAction, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation so links inside it work intuitively.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open on mobile.
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile overlay */}
      {open && (
        <button
          type="button"
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* Sidebar — slides in on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:transition-none`}
      >
        <Sidebar role={role} permissions={permissions} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sticky top-0 z-20 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden -ml-1 inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="text-sm text-neutral-500 min-w-0 hidden sm:block">
              Signed in as{" "}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{userName}</span>{" "}
              <span className="ml-2 inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs">
                {role}
              </span>
            </div>
            <div className="text-sm font-medium sm:hidden">Inventory & P&L</div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-screen-2xl w-full">{children}</main>
      </div>
    </div>
  );
}
