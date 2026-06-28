import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { getSupplierBalances } from "@/lib/suppliers";
import { formatInr } from "@/lib/money";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusPill,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

export const metadata = { title: "Suppliers · BookWise" };

export default async function SuppliersPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "suppliers", "view")) {
    redirect("/dashboard");
  }

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  const balances = await getSupplierBalances(suppliers.map((s) => s.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="India-side suppliers, purchases, and payments (all in INR)."
        actions={<LinkButton href="/suppliers/new">+ New supplier</LinkButton>}
      />

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Add your first supplier, then attribute shipments to them to track what you owe."
          action={<LinkButton href="/suppliers/new">+ New supplier</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Supplier</TH>
                <TH>Contact</TH>
                <TH className="text-right">Purchased (INR)</TH>
                <TH className="text-right">Paid (INR)</TH>
                <TH className="text-right">Outstanding (INR)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {suppliers.map((s) => {
                const b = balances.get(s.id)!;
                const outstanding = b.outstandingInr;
                const settled = outstanding.lessThanOrEqualTo(0);
                return (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/suppliers/${s.id}`} className="hover:underline font-medium">
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {s.contactPerson ?? s.phone ?? <span className="text-neutral-400">—</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatInr(b.purchasedInr)}</TD>
                    <TD className="text-right tabular-nums">{formatInr(b.paidInr)}</TD>
                    <TD className={`text-right tabular-nums font-medium ${outstanding.greaterThan(0) ? "text-amber-700 dark:text-amber-400" : ""}`}>
                      {formatInr(outstanding)}
                    </TD>
                    <TD>
                      <StatusPill
                        status={settled ? "ok" : "warn"}
                        label={settled ? "Settled" : "Outstanding"}
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
