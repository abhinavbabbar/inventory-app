import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { formatInr } from "@/lib/money";
import { getPayables } from "@/lib/reports";
import { Card, EmptyState, PageHeader, StatTile, Table, TD, TH, THead, TR } from "@/components/ui";

export const metadata = { title: "Supplier payables · Reports" };

export default async function PayablesPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "reports", "view")) redirect("/dashboard");

  const { rows, totalInr } = await getPayables();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier payables"
        description={<><Link href="/reports" className="hover:underline">Reports</Link> · what you owe suppliers (INR)</>}
      />

      <div className="max-w-xs">
        <StatTile grad="from-rose-500 to-red-600" label="Total outstanding" value={formatInr(totalInr)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="All suppliers settled" description="There are no outstanding supplier balances." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Supplier</TH>
                <TH className="text-right">Purchased</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Outstanding</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.supplierId}>
                  <TD>
                    <Link href={`/suppliers/${r.supplierId}`} className="hover:underline">{r.name}</Link>
                  </TD>
                  <TD className="text-right tabular-nums">{formatInr(r.purchasedInr)}</TD>
                  <TD className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatInr(r.paidInr)}</TD>
                  <TD className="text-right tabular-nums font-medium text-rose-700 dark:text-rose-400">{formatInr(r.outstandingInr)}</TD>
                </TR>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Total</TD><TD /><TD />
                <TD className="text-right tabular-nums">{formatInr(totalInr)}</TD>
              </TR>
            </tfoot>
          </Table>
        </Card>
      )}
    </div>
  );
}
