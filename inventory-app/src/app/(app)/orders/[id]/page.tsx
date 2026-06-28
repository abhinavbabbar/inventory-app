import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatAed, sumDecimal } from "@/lib/money";
import { type OrderStatus, ORDER_PAYMENT_METHOD_LABELS, type OrderPaymentMethod } from "@/lib/domain";
import { getStockSummariesForItems } from "@/lib/items";
import { getCompanyInfo } from "@/lib/settings";
import { waLink } from "@/lib/whatsapp";
import { ShareActions } from "@/components/share-actions";
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
  addOrderPayment,
  deleteOrderPayment,
  cancelOrder,
  dispatchOrder,
  sendOrderReminderEmail,
} from "../actions";
import {
  CancelOrderButton,
  DispatchOrderButton,
} from "../_components/order-action-buttons";
import { AddOrderPaymentForm, DeleteOrderPaymentButton } from "../_components/payment-ledger";

export const metadata = { title: "Order · BookWise" };

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
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!order) notFound();

  const subtotal = sumDecimal(
    order.lines.map((l) => (l.unitSalePriceAed as Prisma.Decimal).mul(l.quantity)),
  );
  const total = subtotal.add(order.vatAmountAed as Prisma.Decimal);

  // Payment ledger: who paid how much, what's left.
  const totalPaid = sumDecimal(order.payments.map((p) => p.amountAed as Prisma.Decimal));
  const remaining = total.sub(totalPaid);
  const fullyPaid = !remaining.isPositive(); // remaining <= 0
  const paymentTone = fullyPaid ? "ok" : totalPaid.isPositive() ? "warn" : "muted";
  const paymentLabel = fullyPaid ? "Fully paid" : totalPaid.isPositive() ? "Partially paid" : "Unpaid";

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

  const addPayment = addOrderPayment.bind(null, id);
  const emailReminder = sendOrderReminderEmail.bind(null, id);

  const brand = (await getCompanyInfo()).name || "BookWise";
  const reminderMsg = `Hi ${order.customer.name}, a friendly reminder that order ${order.orderNumber} has an outstanding balance of ${formatAed(remaining.isNegative() ? new Prisma.Decimal(0) : remaining)}. Thank you!`;
  const reminderWa = remaining.isPositive() ? waLink(order.customer.mobile, reminderMsg) : null;

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

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payments</h2>
          <StatusPill status={paymentTone} label={paymentLabel} />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900/50 p-4">
            <div className="text-xs text-neutral-500">Order total</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{formatAed(total)}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-4">
            <div className="text-xs text-neutral-500">Paid</div>
            <div className="text-xl font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
              {formatAed(totalPaid)}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">{order.payments.length} payment{order.payments.length === 1 ? "" : "s"}</div>
          </div>
          <div className={`rounded-lg p-4 ${remaining.isPositive() ? "bg-amber-50 dark:bg-amber-900/20" : "bg-neutral-50 dark:bg-neutral-900/50"}`}>
            <div className="text-xs text-neutral-500">Remaining</div>
            <div className={`text-xl font-semibold tabular-nums mt-1 ${remaining.isPositive() ? "text-amber-700 dark:text-amber-400" : ""}`}>
              {formatAed(remaining.isNegative() ? new Prisma.Decimal(0) : remaining)}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              Advance expected {formatAed(order.advanceAmountAed)} ({(order.advancePct as Prisma.Decimal).toString()}%)
            </div>
          </div>
        </div>

        {/* Ledger */}
        {order.payments.length > 0 && (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Paid by</TH>
                <TH>Method</TH>
                <TH>Notes</TH>
                <TH className="text-right">Amount</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {order.payments.map((p) => {
                const del = deleteOrderPayment.bind(null, id, p.id);
                async function handleDelete() {
                  "use server";
                  await del();
                }
                return (
                  <TR key={p.id}>
                    <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(p.paidAt)}</TD>
                    <TD className="font-medium">{p.payerName}</TD>
                    <TD>{p.method ? ORDER_PAYMENT_METHOD_LABELS[p.method as OrderPaymentMethod] ?? p.method : <span className="text-neutral-400">—</span>}</TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">{p.notes ?? <span className="text-neutral-400">—</span>}</TD>
                    <TD className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                      {formatAed(p.amountAed)}
                    </TD>
                    <TD className="text-right">
                      {status !== "CANCELLED" && <DeleteOrderPaymentButton action={handleDelete} />}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
              <TR>
                <TD>Total paid</TD>
                <TD />
                <TD />
                <TD />
                <TD className="text-right tabular-nums">{formatAed(totalPaid)}</TD>
                <TD />
              </TR>
            </tfoot>
          </Table>
        )}

        {/* Reminder for outstanding balance */}
        {status !== "CANCELLED" && remaining.isPositive() && (
          <div className="flex items-center justify-between gap-3 flex-wrap border-t border-neutral-200 dark:border-neutral-800 pt-3">
            <span className="text-sm text-neutral-500">
              Outstanding {formatAed(remaining)} — send a reminder
            </span>
            <ShareActions
              waHref={reminderWa}
              waLabel="WhatsApp reminder"
              emailAction={emailReminder}
              emailLabel="Email reminder"
              emailHint={order.customer.email ? undefined : "No customer email on file"}
            />
          </div>
        )}

        {/* Add a payment */}
        {status !== "CANCELLED" && (
          <AddOrderPaymentForm
            action={addPayment}
            remaining={(remaining.isNegative() ? new Prisma.Decimal(0) : remaining).toNumber()}
          />
        )}
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
