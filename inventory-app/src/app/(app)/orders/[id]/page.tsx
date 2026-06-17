import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { type OrderStatus } from "@/lib/domain";
import { getStockSummariesForItems } from "@/lib/items";
import {
  Card,
  PageHeader,
  StatusPill,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

import {
  toggleAdvancePaid,
  toggleBalancePaid,
  cancelOrder,
  dispatchOrder,
} from "../actions";
import {
  ToggleAdvanceButton,
  ToggleBalanceButton,
  CancelOrderButton,
  DispatchOrderButton,
} from "../_components/order-action-buttons";

export const metadata = { title: "Order · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

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

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { item: true }, orderBy: { id: "asc" } },
      sale: { select: { id: true, invoiceNumber: true } },
      leads: { select: { id: true, name: true } },
    },
  });
  if (!order) notFound();

  const subtotal = sumDecimal(
    order.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
  );
  const total = subtotal.add(order.vatAmountAed as Prisma.Decimal);

  // Stock check for dispatch readiness
  const summaries = await getStockSummariesForItems(order.lines.map((l) => l.itemId));
  const shortfalls = order.lines
    .map((line) => {
      const have = summaries.get(line.itemId)?.currentStock ?? 0;
      return have < line.quantity
        ? { name: line.item.name, sku: line.item.sku, need: line.quantity, have }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const hasShortfall = shortfalls.length > 0;

  const status = order.status as OrderStatus;
  const isInProgress = status === "IN_PROGRESS";
  const advancePaid = order.advancePaidAt != null;
  const balancePaid = order.balancePaidAt != null;

  async function handleToggleAdvance() {
    "use server";
    await toggleAdvancePaid(id);
  }
  async function handleToggleBalance() {
    "use server";
    await toggleBalancePaid(id);
  }
  async function handleCancel() {
    "use server";
    await cancelOrder(id);
  }
  async function handleDispatch() {
    "use server";
    try {
      await dispatchOrder(id);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        description={
          <>
            {dateFmt.format(order.orderedAt)} ·{" "}
            <Link href={`/customers/${order.customer.id}`} className="hover:underline">
              {order.customer.name}
            </Link>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={statusTone[status]} label={statusLabels[status]} />
            {isInProgress && <CancelOrderButton action={handleCancel} />}
          </div>
        }
      />

      {status === "DISPATCHED" && order.sale && (
        <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
          <p className="text-sm text-green-900 dark:text-green-200">
            Dispatched {order.dispatchedAt && dateTimeFmt.format(order.dispatchedAt)} ·{" "}
            <Link
              href={`/sales/${order.sale.id}`}
              className="font-mono hover:underline font-medium"
            >
              {order.sale.invoiceNumber}
            </Link>{" "}
            ·{" "}
            <Link href={`/sales/${order.sale.id}/invoice`} className="hover:underline">
              Download invoice →
            </Link>
          </p>
        </Card>
      )}

      {status === "CANCELLED" && (
        <Card className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border-neutral-300">
          <p className="text-sm text-neutral-600">
            Cancelled {order.cancelledAt && dateTimeFmt.format(order.cancelledAt)}.
          </p>
        </Card>
      )}

      {order.leads.length > 0 && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            Originated from lead:{" "}
            {order.leads.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ", "}
                <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
              </span>
            ))}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Customer</div>
          <div className="font-medium mt-1">{order.customer.name}</div>
          <div className="text-sm text-neutral-500 mt-1 whitespace-pre-wrap">
            {order.customer.mobile ?? ""}
            {order.customer.mobile && order.customer.email ? " · " : ""}
            {order.customer.email ?? ""}
            {order.customer.deliveryAddress && `\n${order.customer.deliveryAddress}`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Total</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{formatAed(total)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Subtotal {formatAed(subtotal)} · VAT{" "}
            {(order.vatRatePct as Prisma.Decimal).toString()}%
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Expected dispatch</div>
          <div className="font-medium mt-1">
            {order.expectedDispatchAt
              ? dateFmt.format(order.expectedDispatchAt)
              : <span className="text-neutral-400">—</span>}
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold">Payment</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">
                  Advance ({(order.advancePct as Prisma.Decimal).toString()}%)
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatAed(order.advanceAmountAed)}
                </div>
              </div>
              <StatusPill
                status={advancePaid ? "ok" : (order.advanceAmountAed as Prisma.Decimal).isZero() ? "muted" : "warn"}
                label={
                  advancePaid
                    ? `Paid ${order.advancePaidAt ? dateFmt.format(order.advancePaidAt) : ""}`
                    : (order.advanceAmountAed as Prisma.Decimal).isZero()
                      ? "No advance"
                      : "Pending"
                }
              />
            </div>
            {isInProgress && !(order.advanceAmountAed as Prisma.Decimal).isZero() && (
              <ToggleAdvanceButton paid={advancePaid} action={handleToggleAdvance} />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">Balance</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatAed(order.balanceAmountAed)}
                </div>
              </div>
              <StatusPill
                status={balancePaid ? "ok" : (order.balanceAmountAed as Prisma.Decimal).isZero() ? "muted" : "warn"}
                label={
                  balancePaid
                    ? `Paid ${order.balancePaidAt ? dateFmt.format(order.balancePaidAt) : ""}`
                    : (order.balanceAmountAed as Prisma.Decimal).isZero()
                      ? "No balance"
                      : "Pending"
                }
              />
            </div>
            {isInProgress && !(order.balanceAmountAed as Prisma.Decimal).isZero() && (
              <ToggleBalanceButton paid={balancePaid} action={handleToggleBalance} />
            )}
          </div>
        </div>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Line items</h2>
          {isInProgress && (
            <DispatchOrderButton
              action={handleDispatch}
              advancePaid={advancePaid || (order.advanceAmountAed as Prisma.Decimal).isZero()}
              hasShortfall={hasShortfall}
            />
          )}
        </div>

        {hasShortfall && isInProgress && (
          <Card className="p-4 mb-3 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700">
            <p className="text-sm text-red-900 dark:text-red-200 font-medium mb-1">
              Insufficient stock — dispatch blocked
            </p>
            <ul className="text-sm text-red-800 dark:text-red-200 list-disc list-inside">
              {shortfalls.map((s) => (
                <li key={s.sku}>
                  {s.name} ({s.sku}): need {s.need}, have {s.have}
                </li>
              ))}
            </ul>
            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              Record a shipment with more units, or cancel this order.
            </p>
          </Card>
        )}

        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Qty ordered</TH>
                <TH className="text-right">Current stock</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right">Line total</TH>
              </TR>
            </THead>
            <tbody>
              {order.lines.map((line) => {
                const have = summaries.get(line.itemId)?.currentStock ?? 0;
                const short = isInProgress && have < line.quantity;
                return (
                  <TR key={line.id}>
                    <TD>
                      <Link href={`/inventory/${line.itemId}`} className="hover:underline">
                        {line.item.name}{" "}
                        <span className="font-mono text-xs text-neutral-500">({line.item.sku})</span>
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{line.quantity}</TD>
                    <TD className={`text-right tabular-nums ${short ? "text-red-600" : ""}`}>
                      {have} {line.item.unit}
                    </TD>
                    <TD className="text-right tabular-nums">{formatAed(line.unitSalePriceAed)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatAed((line.unitSalePriceAed as Prisma.Decimal).mul(line.quantity))}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Subtotal</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(subtotal)}</TD>
              </TR>
              <TR>
                <TD>VAT ({(order.vatRatePct as Prisma.Decimal).toString()}%)</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(order.vatAmountAed)}</TD>
              </TR>
              <TR>
                <TD className="font-semibold">Total</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums font-semibold">{formatAed(total)}</TD>
              </TR>
            </tfoot>
          </Table>
        </Card>
      </section>

      {order.notes && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Notes</h2>
          <Card className="p-4 text-sm whitespace-pre-wrap">{order.notes}</Card>
        </section>
      )}
    </div>
  );
}
