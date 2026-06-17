"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Resource } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  resource: Resource;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", resource: "dashboard" },
  { href: "/inventory", label: "Inventory", resource: "items" },
  { href: "/shipments", label: "Shipments", resource: "shipments" },
  { href: "/leads", label: "Leads", resource: "leads" },
  { href: "/orders", label: "Orders", resource: "orders" },
  { href: "/sales", label: "Sales", resource: "sales" },
  { href: "/customers", label: "Customers", resource: "customers" },
  { href: "/opex", label: "Opex", resource: "opex" },
  { href: "/partners", label: "Partners", resource: "partners" },
  { href: "/settings", label: "Settings", resource: "settings" },
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
    <aside className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col">
      <div className="h-14 px-6 flex items-center border-b border-neutral-200 dark:border-neutral-800">
        <span className="font-semibold text-sm">Inventory & P&L</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {visible.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
