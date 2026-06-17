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

export const metadata = { title: "Customers · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

type SearchParams = { q?: string };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q } = await searchParams;

  const customers = await prisma.customer.findMany({
    where: {
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { mobile: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      sales: {
        select: {
          soldAt: true,
          vatAmountAed: true,
          lines: { select: { quantity: true, unitSalePriceAed: true } },
        },
      },
    },
  });

  const rows = customers.map((c) => {
    const total = sumDecimal(
      c.sales.flatMap((s) =>
        s.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
      ).concat(c.sales.map((s) => s.vatAmountAed as Prisma.Decimal)),
    );
    const lastSale = c.sales.reduce<Date | null>(
      (acc, s) => (acc == null || s.soldAt > acc ? s.soldAt : acc),
      null,
    );
    return { customer: c, orderCount: c.sales.length, lifetime: total, lastSale };
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Buyers in the UAE. Walk-in sales don't require a customer record."
        actions={<LinkButton href="/customers/new">+ New customer</LinkButton>}
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name, mobile, or email…"
          className="h-9 w-72 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 text-sm"
        >
          Filter
        </button>
        {q && (
          <Link href="/customers" className="text-sm text-neutral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add a customer here, or create one inline when recording a sale."
          action={<LinkButton href="/customers/new">+ New customer</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Mobile</TH>
                <TH>Email</TH>
                <TH className="text-right">Orders</TH>
                <TH className="text-right">Lifetime spend</TH>
                <TH>Last order</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map(({ customer, orderCount, lifetime, lastSale }) => (
                <TR key={customer.id}>
                  <TD>
                    <Link href={`/customers/${customer.id}`} className="hover:underline">
                      {customer.name}
                    </Link>
                  </TD>
                  <TD>{customer.mobile ?? <span className="text-neutral-400">—</span>}</TD>
                  <TD>{customer.email ?? <span className="text-neutral-400">—</span>}</TD>
                  <TD className="text-right tabular-nums">{orderCount}</TD>
                  <TD className="text-right tabular-nums">
                    {orderCount > 0 ? formatAed(lifetime) : <span className="text-neutral-400">—</span>}
                  </TD>
                  <TD className="text-neutral-600 dark:text-neutral-400">
                    {lastSale ? dateFmt.format(lastSale) : <span className="text-neutral-400">—</span>}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
