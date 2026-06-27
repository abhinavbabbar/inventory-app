import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { formatAed } from "@/lib/money";
import { getPnl, parseRange } from "@/lib/reports";
import { OPEX_CATEGORY_LABELS, type OpexCategory } from "@/lib/domain";
import { Card, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";

import { DateRangeForm } from "../_components/date-range";

export const metadata = { title: "Profit & Loss · Reports" };

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !can(session.user, "reports", "view")) redirect("/dashboard");

  const range = parseRange(await searchParams);
  const pnl = await getPnl(range);

  const Line = ({ label, value, strong, indent, negative }: { label: string; value: string; strong?: boolean; indent?: boolean; negative?: boolean }) => (
    <div className={`flex items-center justify-between py-2 ${strong ? "border-t border-neutral-200 dark:border-neutral-800 font-semibold" : ""}`}>
      <span className={`${indent ? "pl-4 text-neutral-500" : ""}`}>{label}</span>
      <span className={`tabular-nums ${negative ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description={<><Link href="/reports" className="hover:underline">Reports</Link> · {range.label}</>}
      />
      <DateRangeForm basePath="/reports/profit-loss" from={range.fromStr} to={range.toStr} />

      <Card className="p-6 max-w-2xl">
        <Line label="Revenue (net sales)" value={formatAed(pnl.revenue)} />
        <Line label="Cost of goods sold (FIFO)" value={`(${formatAed(pnl.cogs)})`} indent />
        <Line label="Gross profit" value={formatAed(pnl.grossProfit)} strong negative={pnl.grossProfit.isNegative()} />

        <div className="mt-4 text-xs uppercase tracking-wide text-neutral-400">Operating expenses</div>
        {pnl.opexByCategory.length === 0 ? (
          <Line label="No opex in this period" value={formatAed(0)} indent />
        ) : (
          pnl.opexByCategory.map((o) => (
            <Line
              key={o.category}
              label={OPEX_CATEGORY_LABELS[o.category as OpexCategory] ?? o.category}
              value={`(${formatAed(o.amount)})`}
              indent
            />
          ))
        )}
        <Line label="Total operating expenses" value={`(${formatAed(pnl.opexTotal)})`} />

        <Line label="Net profit" value={formatAed(pnl.netProfit)} strong negative={pnl.netProfit.isNegative()} />
      </Card>

      <Card className="p-4 max-w-2xl bg-neutral-50 dark:bg-neutral-900/50">
        <Table>
          <THead>
            <TR><TH>Memo</TH><TH className="text-right">Value</TH></TR>
          </THead>
          <tbody>
            <TR><TD className="text-neutral-500">Invoices in period</TD><TD className="text-right tabular-nums">{pnl.salesCount}</TD></TR>
            <TR><TD className="text-neutral-500">VAT collected (not part of profit)</TD><TD className="text-right tabular-nums">{formatAed(pnl.vatCollected)}</TD></TR>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
