import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import { CustomerForm } from "../_components/customer-form";
import { ToggleActiveButton } from "../_components/toggle-active-button";
import { updateCustomer, toggleCustomerActive } from "../actions";

export const metadata = { title: "Customer · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: {
        orderBy: { soldAt: "desc" },
        include: {
          lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
        },
      },
    },
  });
  if (!customer) notFound();

  const orderRows = customer.sales.map((s) => {
    const subtotal = sumDecimal(
      s.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
    );
    const total = subtotal.add(s.vatAmountAed as Prisma.Decimal);
    const cogs = sumDecimal(
      s.lines.map((l) => (l.unitCostAedSnapshot as Prisma.Decimal).mul(l.quantity)),
    );
    const grossProfit = subtotal.sub(cogs);
    return { sale: s, subtotal, total, grossProfit };
  });

  const lifetime = sumDecimal(orderRows.map((r) => r.total));
  const updateThis = updateCustomer.bind(null, id);

  async function handleToggle() {
    "use server";
    await toggleCustomerActive(id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        description={
          <span className="text-sm text-neutral-500">
            {customer.mobile ?? "—"} · {customer.email ?? "—"}
          </span>
        }
        actions={<ToggleActiveButton isActive={customer.isActive} action={handleToggle} />}
      />

      {!customer.isActive && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200 px-4 py-2 text-sm">
          This customer is inactive and hidden from lists. Order history is preserved.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Orders</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{customer.sales.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Lifetime spend</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">
            {customer.sales.length > 0 ? formatAed(lifetime) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Delivery address</div>
          <div className="text-sm mt-1 whitespace-pre-wrap">
            {customer.deliveryAddress ?? <span className="text-neutral-400">—</span>}
          </div>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Edit details</h2>
        <CustomerForm
          action={updateThis}
          submitLabel="Save changes"
          cancelHref="/customers"
          defaultValues={{
            name: customer.name,
            mobile: customer.mobile,
            email: customer.email,
            deliveryAddress: customer.deliveryAddress,
            notes: customer.notes,
          }}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Order history</h2>
        {orderRows.length === 0 ? (
          <EmptyState title="No orders yet" description="Record a sale from the Sales section." />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH className="text-right">VAT</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Gross profit</TH>
                </TR>
              </THead>
              <tbody>
                {orderRows.map(({ sale, subtotal, total, grossProfit }) => (
                  <TR key={sale.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/sales/${sale.id}`} className="hover:underline">
                        {sale.invoiceNumber}
                      </Link>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {dateFmt.format(sale.soldAt)}
                    </TD>
                    <TD className="text-right tabular-nums">{formatAed(subtotal)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(sale.vatAmountAed)}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatAed(total)}</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        grossProfit.isNegative()
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-700 dark:text-green-400"
                      }`}
                    >
                      {formatAed(grossProfit)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
