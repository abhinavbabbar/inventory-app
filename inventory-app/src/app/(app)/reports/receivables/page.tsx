import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { formatAed } from "@/lib/money";
import { getReceivablesAging } from "@/lib/reports";
import { Card, EmptyState, PageHeader, StatTile, StatusPill, Table, TD, TH, THead, TR } from "@/components/ui";

export const metadata = { title: "Receivables aging · Reports" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const bucketLabel: Record<string, string> = {
  current: "Current (≤30d)",
  d30: "31–60 days",
  d60: "61–90 days",
  d90: "90+ days",
};

const bucketGrad: Record<string, string> = {
  current: "from-emerald-500 to-teal-600",
  d30: "from-amber-500 to-orange-600",
  d60: "from-orange-500 to-rose-600",
  d90: "from-rose-500 to-red-600",
};

export default async function ReceivablesPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "reports", "view")) redirect("/dashboard");

  const report = await getReceivablesAging();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receivables aging"
        description={<><Link href="/reports" className="hover:underline">Reports</Link> · who owes you, by age</>}
      />

      {/* Bucket summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(["current", "d30", "d60", "d90"] as const).map((b) => (
          <StatTile key={b} grad={bucketGrad[b]} label={bucketLabel[b]} value={formatAed(report.buckets[b])} />
        ))}
        <StatTile grad="from-fuchsia-500 to-pink-600" label="Total owed" value={formatAed(report.total)} />
      </div>

      {report.rows.length === 0 ? (
        <EmptyState title="Nothing outstanding" description="Every order with a balance has been fully paid." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Ordered</TH>
                <TH>Age</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Remaining</TH>
              </TR>
            </THead>
            <tbody>
              {report.rows.map((r) => (
                <TR key={r.orderId}>
                  <TD className="font-mono text-xs">
                    <Link href={`/orders/${r.orderId}`} className="hover:underline">{r.orderNumber}</Link>
                  </TD>
                  <TD>{r.customerName}</TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(r.orderedAt)}</TD>
                  <TD>
                    <StatusPill
                      status={r.bucket === "current" ? "ok" : r.bucket === "d90" ? "bad" : "warn"}
                      label={`${r.ageDays}d`}
                    />
                  </TD>
                  <TD className="text-right tabular-nums">{formatAed(r.total)}</TD>
                  <TD className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatAed(r.paid)}</TD>
                  <TD className="text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">{formatAed(r.remaining)}</TD>
                </TR>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Total</TD><TD /><TD /><TD /><TD /><TD />
                <TD className="text-right tabular-nums">{formatAed(report.total)}</TD>
              </TR>
            </tfoot>
          </Table>
        </Card>
      )}
    </div>
  );
}
