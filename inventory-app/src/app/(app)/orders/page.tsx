import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain";
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

export const metadata = { title: "Orders · BookWise" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const statusLabels: Record<OrderStatus, string> = {
  IN_PROGRESS: "In progress",
  DISPATCHED: "Dispatched",
  CANCELLED: "Cancelled",
};

const statusTone: Record<OrderStatus, "ok" | "warn" | "muted"> = {
  IN_PROGRESS: "warn",
  DISPATCHED: "ok",
  CANCELLED: "muted",
};

type SearchParams = { status?: OrderStatus | "ALL" };

function paymentStatusFor(order: {
  advancePaidAt: Date | null;
  balancePaidAt: Date | null;
  advanceAmountAed: Prisma.Decimal;
}): { label: string; tone: "ok" | "warn" | "muted" } {
  if (order.balancePaidAt) return { label: "Fully paid", tone: "ok" };
  if (order.advancePaidAt) return { label: "Advance paid", tone: "warn" };
  if (order.advanceAmountAed.isZero()) return { label: "No advance", tone: "muted" };
  return { label: "Pending advance", tone: "warn" };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { status = "ALL" } = await searchParams;

  const orders = await prisma.order.findMany({
    where: status !== "ALL" ? { status } : {},
    orderBy: [{ status: "asc" }, { orderedAt: "desc" }],
    include: {
      customer: { select: { id: true, name: true } },
      lines: { select: { quantity: true, unitSalePriceAed: true } },
    },
  });

  const counts = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const countByStatus = new Map(counts.map((c) => [c.status as OrderStatus, c._count._all]));
  const total = counts.reduce((a, c) => a + c._count._all, 0);

  const pipeline: Array<{ status: OrderStatus; accent: string; value: string }> = [
    { status: "IN_PROGRESS", accent: "border-l-amber-500 text-amber-700 dark:text-amber-400", value: "amber" },
    { status: "DISPATCHED", accent: "border-l-emerald-500 text-emerald-700 dark:text-emerald-400", value: "emerald" },
    { status: "CANCELLED", accent: "border-l-neutral-400 text-neutral-500", value: "neutral" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Customer orders with advance payment. Dispatch consumes stock and produces a sale."
        actions={<LinkButton href="/orders/new">+ New order</LinkButton>}
      />

      {/* Status pipeline */}
      <div className="grid grid-cols-3 gap-4">
        {pipeline.map((p) => (
          <Link key={p.status} href={`/orders?status=${p.status}`}>
            <Card className={`p-4 border-l-4 ${p.accent.split(" ")[0]} hover:shadow-sm transition-shadow`}>
              <div className="text-xs text-neutral-500">{statusLabels[p.status]}</div>
              <div className={`text-2xl font-semibold mt-1 tabular-nums ${p.accent.split(" ").slice(1).join(" ")}`}>
                {countByStatus.get(p.status) ?? 0}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={status}
          className="h-9 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
        >
          <option value="ALL">All ({total})</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]} ({countByStatus.get(s) ?? 0})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 text-sm"
        >
          Filter
        </button>
        {status !== "ALL" && (
          <Link href="/orders" className="text-sm text-neutral-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Create an order from a lead, or directly here."
          action={<LinkButton href="/orders/new">+ New order</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH className="text-right">Subtotal</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Advance / Balance</TH>
                <TH>Payment</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {orders.map((o) => {
                const subtotal = sumDecimal(
                  o.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
                );
                const total = subtotal.add(o.vatAmountAed as Prisma.Decimal);
                const payment = paymentStatusFor({
                  advancePaidAt: o.advancePaidAt,
                  balancePaidAt: o.balancePaidAt,
                  advanceAmountAed: o.advanceAmountAed as Prisma.Decimal,
                });
                return (
                  <TR key={o.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {dateFmt.format(o.orderedAt)}
                    </TD>
                    <TD>
                      <Link href={`/customers/${o.customer.id}`} className="hover:underline">
                        {o.customer.name}
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{formatAed(subtotal)}</TD>
                    <TD className="text-right tabular-nums font-medium">{formatAed(total)}</TD>
                    <TD className="text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {formatAed(o.advanceAmountAed)} / {formatAed(o.balanceAmountAed)}
                    </TD>
                    <TD>
                      <StatusPill status={payment.tone} label={payment.label} />
                    </TD>
                    <TD>
                      <StatusPill
                        status={statusTone[o.status as OrderStatus]}
                        label={statusLabels[o.status as OrderStatus] ?? o.status}
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
