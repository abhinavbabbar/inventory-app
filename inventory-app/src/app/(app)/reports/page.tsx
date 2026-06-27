import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Reports · Inventory & P&L" };

const REPORTS = [
  {
    href: "/reports/profit-loss",
    title: "Profit & Loss",
    description: "Revenue, cost of goods sold, gross profit, opex and net profit for any period.",
    accent: "border-l-emerald-500",
  },
  {
    href: "/reports/vat",
    title: "VAT return summary",
    description: "Standard-rated supplies and output VAT collected — for your UAE VAT (FTA) filing.",
    accent: "border-l-indigo-500",
  },
  {
    href: "/reports/receivables",
    title: "Receivables aging",
    description: "Who owes you: outstanding order balances, bucketed by how overdue they are.",
    accent: "border-l-amber-500",
  },
  {
    href: "/reports/payables",
    title: "Supplier payables",
    description: "What you owe each supplier in INR — purchased vs. paid, outstanding first.",
    accent: "border-l-rose-500",
  },
];

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "reports", "view")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Financial and tax reports for your business." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className={`p-5 border-l-4 ${r.accent} hover:shadow-sm transition-shadow h-full`}>
              <h2 className="font-semibold">{r.title}</h2>
              <p className="text-sm text-neutral-500 mt-1">{r.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
