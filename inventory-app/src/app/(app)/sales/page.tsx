import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

export const metadata = { title: "Sales · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function SalesPage() {
  const sales = await prisma.sale.findMany({
    orderBy: { soldAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { select: { quantity: true, unitSalePriceAed: true, unitCostAedSnapshot: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Orders with FIFO cost snapshot and printable invoices."
        actions={<LinkButton href="/sales/new">+ New sale</LinkButton>}
      />

      {sales.length === 0 ? (
        <EmptyState
          title="No sales yet"
          description="Record your first sale to start generating invoices."
          action={<LinkButton href="/sales/new">+ New sale</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Place</TH>
                <TH className="text-right">Subtotal</TH>
                <TH className="text-right">VAT</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Gross profit</TH>
              </TR>
            </THead>
            <tbody>
              {sales.map((s) => {
                const subtotal = sumDecimal(
                  s.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
                );
                const total = subtotal.add(s.vatAmountAed as Prisma.Decimal);
                const cogs = sumDecimal(
                  s.lines.map((l) => (l.unitCostAedSnapshot as Prisma.Decimal).mul(l.quantity)),
                );
                const gross = subtotal.sub(cogs);
                return (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/sales/${s.id}`} className="hover:underline">
                        {s.invoiceNumber}
                      </Link>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {dateFmt.format(s.soldAt)}
                    </TD>
                    <TD>
                      {s.customer ? (
                        <Link href={`/customers/${s.customer.id}`} className="hover:underline">
                          {s.customer.name}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">Walk-in</span>
                      )}
                    </TD>
                    <TD>
                      {s.placeOfSale ? (
                        <span className="inline-flex items-center rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 px-2 py-0.5 text-xs font-medium">
                          {s.placeOfSale}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{formatAed(subtotal)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(s.vatAmountAed)}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatAed(total)}</TD>
                    <TD
                      className={`text-right tabular-nums ${
                        gross.isNegative() ? "text-red-600" : "text-green-700 dark:text-green-400"
                      }`}
                    >
                      {formatAed(gross)}
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
