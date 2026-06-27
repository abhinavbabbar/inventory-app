"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Resource } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  resource: Resource;
  dot: string; // tailwind bg color for the item's accent dot
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", resource: "dashboard", dot: "bg-indigo-500" },
  { href: "/reports", label: "Reports", resource: "reports", dot: "bg-fuchsia-500" },
  { href: "/inventory", label: "Inventory", resource: "items", dot: "bg-cyan-500" },
  { href: "/shipments", label: "Shipments", resource: "shipments", dot: "bg-sky-500" },
  { href: "/suppliers", label: "Suppliers", resource: "suppliers", dot: "bg-teal-500" },
  { href: "/leads", label: "Leads", resource: "leads", dot: "bg-amber-500" },
  { href: "/estimates", label: "Estimates", resource: "estimates", dot: "bg-lime-500" },
  { href: "/orders", label: "Orders", resource: "orders", dot: "bg-orange-500" },
  { href: "/sales", label: "Sales", resource: "sales", dot: "bg-emerald-500" },
  { href: "/customers", label: "Customers", resource: "customers", dot: "bg-pink-500" },
  { href: "/opex", label: "Opex", resource: "opex", dot: "bg-rose-500" },
  { href: "/partners", label: "Partners", resource: "partners", dot: "bg-violet-500" },
  { href: "/settings", label: "Settings", resource: "settings", dot: "bg-slate-500" },
];

export function Sidebar({
  role,
  permissions,
}: {
  role: string;
  permissions: string | null;
}) {
  const pathname = usePathname();
  const user = { role, permissions };

  const visible = NAV.filter((item) => can(user, item.resource, "view"));

  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-gradient-to-b from-white to-indigo-50/50 dark:from-neutral-900 dark:to-neutral-950 flex flex-col">
      <div className="h-14 px-6 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800">
        <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm" />
        <span className="font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
          Inventory &amp; P&amp;L
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-200"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${active ? "bg-white" : item.dot}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
