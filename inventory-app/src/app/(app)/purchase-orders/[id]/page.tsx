import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatInr, sumDecimal } from "@/lib/money";
import { getCompanyInfo } from "@/lib/settings";
import { waLink } from "@/lib/whatsapp";
import { PO_STATUS_LABELS, type PoStatus } from "@/lib/domain";
import { ShareActions } from "@/components/share-actions";
import { Card, LinkButton, PageHeader, StatTile, StatusPill, Table, TD, TH, THead, TR } from "@/components/ui";

import { setPoStatus, deletePurchaseOrder, emailPurchaseOrder } from "../actions";
import { PoControls } from "./_components/po-controls";

export const metadata = { title: "Purchase order · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const tone: Record<PoStatus, "ok" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  SENT: "warn",
  CONFIRMED: "warn",
  RECEIVED: "ok",
  CANCELLED: "bad",
};

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !can(session.user, "purchaseOrders", "view")) redirect("/dashboard");

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { include: { item: true }, orderBy: { id: "asc" } },
      receivedShipment: { select: { id: true, reference: true } },
    },
  });
  if (!po) notFound();

  const total = sumDecimal(po.lines.map((l) => (l.unitPurchasePriceInr as Prisma.Decimal).mul(l.quantity)));
  const st = po.status as PoStatus;
  const received = st === "RECEIVED";
  const cancelled = st === "CANCELLED";
  const canReceive = !received && !cancelled;

  const company = await getCompanyInfo();
  const brand = company.name || "Inventory & P&L";
  const waMessage = `Hello, here's purchase order ${po.poNumber} from ${brand}. Total: ${formatInr(total)}.`;
  const waHref = waLink(po.supplier.phone, waMessage);
  const emailThis = emailPurchaseOrder.bind(null, id);

  async function onSent() { "use server"; await setPoStatus(id, "SENT"); }
  async function onConfirmed() { "use server"; await setPoStatus(id, "CONFIRMED"); }
  async function onCancel() { "use server"; await setPoStatus(id, "CANCELLED"); }
  async function onDelete() { "use server"; await deletePurchaseOrder(id); }

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.poNumber}
        description={
          <>
            Ordered {dateFmt.format(po.orderedAt)}
            {po.expectedAt && <> · expected {dateFmt.format(po.expectedAt)}</>}
            {" · "}
            <StatusPill status={tone[st]} label={PO_STATUS_LABELS[st]} />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/purchase-orders/${po.id}/pdf`} variant="secondary">Download PO</LinkButton>
            <ShareActions
              waHref={waHref}
              waLabel="WhatsApp"
              emailAction={emailThis}
              emailLabel="Email PO"
              emailHint={po.supplier.email ? undefined : "No supplier email on file"}
            />
          </div>
        }
      />

      {received && po.receivedShipment && (
        <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
          <p className="text-sm text-green-900 dark:text-green-200">
            Received into shipment{" "}
            <Link href={`/shipments/${po.receivedShipment.id}`} className="font-mono font-medium hover:underline">
              {po.receivedShipment.reference}
            </Link>
            {po.receivedAt && <> on {dateFmt.format(po.receivedAt)}</>}.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Supplier</div>
          <div className="font-medium mt-1">
            <Link href={`/suppliers/${po.supplier.id}`} className="hover:underline">{po.supplier.name}</Link>
          </div>
          <div className="text-sm text-neutral-500 mt-1 whitespace-pre-wrap">
            {po.supplier.phone ?? ""}
            {po.supplier.phone && po.supplier.email ? " · " : ""}
            {po.supplier.email ?? ""}
          </div>
        </Card>
        <StatTile grad="from-indigo-500 to-violet-600" label="Order total (INR)" value={formatInr(total)} sub={`${po.lines.length} line(s)`} />
        <Card className="p-4">
          <div className="text-xs text-neutral-500">Actions</div>
          <div className="mt-2 space-y-2">
            {canReceive && (
              <LinkButton href={`/shipments/new?fromPO=${po.id}`} variant="primary">
                Receive into shipment →
              </LinkButton>
            )}
            <PoControls
              status={st}
              received={received}
              onSent={onSent}
              onConfirmed={onConfirmed}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <THead>
            <TR><TH>Item</TH><TH className="text-right">Qty</TH><TH className="text-right">Unit price (INR)</TH><TH className="text-right">Line total</TH></TR>
          </THead>
          <tbody>
            {po.lines.map((line) => (
              <TR key={line.id}>
                <TD>
                  <Link href={`/inventory/${line.itemId}`} className="hover:underline">
                    {line.item.name} <span className="font-mono text-xs text-neutral-500">({line.item.sku})</span>
                  </Link>
                </TD>
                <TD className="text-right tabular-nums">{line.quantity}</TD>
                <TD className="text-right tabular-nums">{formatInr(line.unitPurchasePriceInr)}</TD>
                <TD className="text-right tabular-nums">{formatInr((line.unitPurchasePriceInr as Prisma.Decimal).mul(line.quantity))}</TD>
              </TR>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 dark:bg-neutral-900/50 font-medium">
            <TR><TD className="font-semibold">Total</TD><TD /><TD /><TD className="text-right tabular-nums font-semibold">{formatInr(total)}</TD></TR>
          </tfoot>
        </Table>
      </Card>

      {po.notes && <Card className="p-4 text-sm whitespace-pre-wrap">{po.notes}</Card>}
    </div>
  );
}
