import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { formatInr, sumDecimal } from "@/lib/money";
import { PO_STATUS_LABELS, type PoStatus } from "@/lib/domain";
import { Card, EmptyState, LinkButton, PageHeader, StatusPill, Table, TD, TH, THead, TR } from "@/components/ui";

export const metadata = { title: "Purchase orders · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const tone: Record<PoStatus, "ok" | "warn" | "bad" | "muted"> = {
  DRAFT: "muted",
  SENT: "warn",
  CONFIRMED: "warn",
  RECEIVED: "ok",
  CANCELLED: "bad",
};

export default async function PurchaseOrdersPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "purchaseOrders", "view")) redirect("/dashboard");

  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { orderedAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { select: { quantity: true, unitPurchasePriceInr: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Orders to suppliers, received into shipments when goods arrive."
        actions={<LinkButton href="/purchase-orders/new">+ New PO</LinkButton>}
      />

      {pos.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Raise a PO to record what you've ordered before it arrives."
          action={<LinkButton href="/purchase-orders/new">+ New PO</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>Status</TH>
                <TH className="text-right">Total (INR)</TH>
              </TR>
            </THead>
            <tbody>
              {pos.map((po) => {
                const total = sumDecimal(po.lines.map((l) => (l.unitPurchasePriceInr as Prisma.Decimal).mul(l.quantity)));
                const st = po.status as PoStatus;
                return (
                  <TR key={po.id}>
                    <TD className="font-mono text-xs"><Link href={`/purchase-orders/${po.id}`} className="hover:underline">{po.poNumber}</Link></TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">{dateFmt.format(po.orderedAt)}</TD>
                    <TD><Link href={`/suppliers/${po.supplier.id}`} className="hover:underline">{po.supplier.name}</Link></TD>
                    <TD><StatusPill status={tone[st]} label={PO_STATUS_LABELS[st]} /></TD>
                    <TD className="text-right tabular-nums font-medium">{formatInr(total)}</TD>
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
