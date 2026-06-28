import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { getSupplierBalances } from "@/lib/suppliers";
import { formatInr, sumDecimal } from "@/lib/money";
import { SUPPLIER_PAYMENT_METHOD_LABELS, type SupplierPaymentMethod } from "@/lib/domain";
import {
  Card,
  EmptyState,
  PageHeader,
  StatTile,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import { SupplierForm } from "../_components/supplier-form";
import { AddPaymentForm } from "../_components/add-payment-form";
import { ToggleActiveButton, DeletePaymentButton } from "../_components/buttons";
import {
  updateSupplier,
  toggleSupplierActive,
  addSupplierPayment,
  deleteSupplierPayment,
} from "../actions";

export const metadata = { title: "Supplier · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !can(session.user, "suppliers", "view")) {
    redirect("/dashboard");
  }
  const canEdit = can(session.user, "suppliers", "edit");

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      shipments: {
        orderBy: { shippedAt: "desc" },
        include: { lines: { select: { quantity: true, unitPurchasePriceInr: true } } },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!supplier) notFound();

  const balance = (await getSupplierBalances([id])).get(id)!;
  const outstanding = balance.outstandingInr;
  const updateThis = updateSupplier.bind(null, id);
  const addPaymentThis = addSupplierPayment.bind(null, id);

  async function handleToggle() {
    "use server";
    await toggleSupplierActive(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={
          <span className="text-sm text-neutral-500">
            {[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "India-side supplier"}
          </span>
        }
        actions={canEdit ? <ToggleActiveButton isActive={supplier.isActive} action={handleToggle} /> : undefined}
      />

      {!supplier.isActive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200 px-4 py-2 text-sm">
          This supplier is inactive and hidden from active lists. History is preserved.
        </div>
      )}

      {/* Balance cards (INR) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile grad="from-indigo-500 to-violet-600" label="Purchased" value={formatInr(balance.purchasedInr)} sub="goods, in INR" />
        <StatTile grad="from-emerald-500 to-teal-600" label="Paid" value={formatInr(balance.paidInr)} sub={`${supplier.payments.length} payment(s)`} />
        <StatTile
          grad={outstanding.greaterThan(0) ? "from-rose-500 to-red-600" : "from-slate-400 to-slate-500"}
          label="Outstanding"
          value={formatInr(outstanding)}
          sub={outstanding.greaterThan(0) ? "still owed" : outstanding.lessThan(0) ? "advance / credit" : "settled"}
        />
      </div>

      {/* Purchases (shipments) */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Purchases (shipments)</h2>
        {supplier.shipments.length === 0 ? (
          <EmptyState
            title="No purchases linked yet"
            description="Assign a shipment to this supplier (on the shipment page or when creating one) to track what you bought."
          />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Reference</TH>
                  <TH>Shipped</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="text-right">Goods cost (INR)</TH>
                </TR>
              </THead>
              <tbody>
                {supplier.shipments.map((s) => {
                  const units = s.lines.reduce((a, l) => a + l.quantity, 0);
                  const goods = sumDecimal(
                    s.lines.map((l) => (l.unitPurchasePriceInr as Prisma.Decimal).mul(l.quantity)),
                  );
                  return (
                    <TR key={s.id}>
                      <TD className="font-mono text-xs">
                        <Link href={`/shipments/${s.id}`} className="hover:underline">{s.reference}</Link>
                      </TD>
                      <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(s.shippedAt)}</TD>
                      <TD className="text-right tabular-nums">{units}</TD>
                      <TD className="text-right tabular-nums">{formatInr(goods)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      {/* Record payment */}
      {canEdit && <AddPaymentForm action={addPaymentThis} outstandingInr={outstanding.greaterThan(0) ? Math.round(outstanding.toNumber()) : 0} />}

      {/* Payment history */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Payment history</h2>
        {supplier.payments.length === 0 ? (
          <EmptyState title="No payments recorded" description="Record a payment above as you pay this supplier." />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Amount (INR)</TH>
                  {canEdit && <TH />}
                </TR>
              </THead>
              <tbody>
                {supplier.payments.map((p) => {
                  const deleteThis = deleteSupplierPayment.bind(null, id, p.id);
                  async function handleDelete() {
                    "use server";
                    await deleteThis();
                  }
                  return (
                    <TR key={p.id}>
                      <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(p.paidAt)}</TD>
                      <TD>{p.method ? SUPPLIER_PAYMENT_METHOD_LABELS[p.method as SupplierPaymentMethod] ?? p.method : <span className="text-neutral-400">—</span>}</TD>
                      <TD className="text-neutral-600 dark:text-neutral-400">{p.reference ?? <span className="text-neutral-400">—</span>}</TD>
                      <TD className="text-neutral-600 dark:text-neutral-400">{p.notes ?? <span className="text-neutral-400">—</span>}</TD>
                      <TD className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{formatInr(p.amountInr)}</TD>
                      {canEdit && (
                        <TD className="text-right"><DeletePaymentButton action={handleDelete} /></TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      {/* Edit details */}
      {canEdit && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Supplier details</h2>
          <SupplierForm
            action={updateThis}
            submitLabel="Save changes"
            cancelHref="/suppliers"
            defaultValues={{
              name: supplier.name,
              contactPerson: supplier.contactPerson,
              phone: supplier.phone,
              email: supplier.email,
              address: supplier.address,
              notes: supplier.notes,
            }}
          />
        </section>
      )}
    </div>
  );
}
