import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { d, formatAed, formatInr, formatNumber, sumDecimal } from "@/lib/money";
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

export const metadata = { title: "Shipments · Inventory & P&L" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const methodLabel: Record<string, string> = {
  EQUAL_PER_UNIT: "Equal/unit",
  WEIGHTED_BY_VALUE: "Weighted",
  MANUAL: "Manual",
};

export default async function ShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { shippedAt: "desc" },
    include: {
      lines: { select: { quantity: true, landedCostAed: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Shipments"
        description="Imports from India. Each shipment locks an FX rate and allocates shipping per line."
        actions={<LinkButton href="/shipments/new">+ New shipment</LinkButton>}
      />

      {shipments.length === 0 ? (
        <EmptyState
          title="No shipments yet"
          description="Record your first shipment to add stock and capture landed cost."
          action={<LinkButton href="/shipments/new">+ New shipment</LinkButton>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Supplier</TH>
                <TH>Shipped</TH>
                <TH>Method</TH>
                <TH className="text-right">Lines</TH>
                <TH className="text-right">Units</TH>
                <TH className="text-right">Shipping (INR)</TH>
                <TH className="text-right">Landed value (AED)</TH>
              </TR>
            </THead>
            <tbody>
              {shipments.map((s) => {
                const units = s.lines.reduce((acc, l) => acc + l.quantity, 0);
                const landedValue = sumDecimal(
                  s.lines.map((l) => (l.landedCostAed as Prisma.Decimal).mul(l.quantity)),
                );
                return (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">
                      <Link href={`/shipments/${s.id}`} className="hover:underline">
                        {s.reference}
                      </Link>
                    </TD>
                    <TD>
                      {s.supplier ? (
                        <Link href={`/suppliers/${s.supplier.id}`} className="hover:underline">
                          {s.supplier.name}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD className="text-neutral-600 dark:text-neutral-400">
                      {dateFmt.format(s.shippedAt)}
                    </TD>
                    <TD>{methodLabel[s.shippingAllocationMethod] ?? s.shippingAllocationMethod}</TD>
                    <TD className="text-right tabular-nums">{s.lines.length}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(units)}</TD>
                    <TD className="text-right tabular-nums">{formatInr(s.totalShippingInr)}</TD>
                    <TD className="text-right tabular-nums">{formatAed(landedValue.eq(0) ? d(0) : landedValue)}</TD>
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
